import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { Loader2, Navigation, Maximize2, Minimize2 } from "lucide-react";
import customerPin from "@/assets/customer-pin.png";
import { deliveryApi } from "../services/deliveryApi";
import deliveryIcon from "@/assets/deliveryIcon.png";
import storePin from "@/assets/store-pin.png";
import SmoothRiderMarker from "@/shared/components/map/SmoothRiderMarker";
import {
  getCachedDeliveryPartnerLocation,
  saveDeliveryPartnerLocation,
} from "../utils/deliveryLastLocation";

const libraries = ["places", "geometry"];
const ROUTE_REFRESH_THRESHOLD_M = 150;
const ROUTE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const RECENTER_INTERVAL_MS = 15000;
const RIDER_FOCUS_RADIUS_M = 500;
const LOCATION_POST_INTERVAL_MS = 5000;

// Container style will be 100% to fill parent
const containerStyle = {
  width: "100%",
  height: "100%",
  minHeight: "200px",
};

/** GeoJSON [lng, lat] → { lat, lng } */
function coordsToLatLng(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function distanceMeters(from, to) {
  if (!from || !to) return null;
  if (
    typeof from.lat !== "number" ||
    typeof from.lng !== "number" ||
    typeof to.lat !== "number" ||
    typeof to.lng !== "number" ||
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  ) {
    return null;
  }

  const r = 6371000;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Module-level route-snap helpers (pure functions, stable references) ────

function getSegmentHeading(A, B) {
  const lat1 = (A.lat * Math.PI) / 180;
  const lat2 = (B.lat * Math.PI) / 180;
  const dLng = ((B.lng - A.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/** Project point P onto segment A→B. Returns { point, dist }. */
function projectOnSegment(P, A, B) {
  const dx = B.lat - A.lat;
  const dy = B.lng - A.lng;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: A, dist: distanceMeters(P, A) || 0 };
  const t = Math.max(0, Math.min(1, ((P.lat - A.lat) * dx + (P.lng - A.lng) * dy) / lenSq));
  const point = { lat: A.lat + t * dx, lng: A.lng + t * dy };
  return { point, dist: distanceMeters(P, point) || 0 };
}

/**
 * Snap rawPt onto rawPath starting search from startSegment.
 * Returns { snapped, segmentIndex, distFromLine } or null.
 */
function snapToPolyline(rawPt, rawPath, startSegment = 0) {
  if (!rawPt || !rawPath || rawPath.length < 2) return null;
  let bestDist = Infinity;
  let bestPoint = null;
  let bestSeg = startSegment;

  // First: search 60 segments ahead (normal forward progress)
  const from = Math.max(0, startSegment);
  const to = Math.min(rawPath.length - 1, startSegment + 60);
  for (let i = from; i < to; i++) {
    const { point, dist } = projectOnSegment(rawPt, rawPath[i], rawPath[i + 1]);
    if (dist < bestDist) { bestDist = dist; bestPoint = point; bestSeg = i; }
  }
  // Fallback: full search if rider is far from the ahead-window (GPS jump / re-route)
  if (bestDist > 60) {
    for (let i = 0; i < rawPath.length - 1; i++) {
      const { point, dist } = projectOnSegment(rawPt, rawPath[i], rawPath[i + 1]);
      if (dist < bestDist) { bestDist = dist; bestPoint = point; bestSeg = i; }
    }
  }
  let heading = 0;
  if (bestPoint && rawPath[bestSeg] && rawPath[bestSeg + 1]) {
    heading = getSegmentHeading(rawPath[bestSeg], rawPath[bestSeg + 1]);
  }
  return bestPoint ? { snapped: bestPoint, segmentIndex: bestSeg, distFromLine: bestDist, heading } : null;
}

function destinationForPhase(order, phase) {
  const isReturn = order?.returnStatus && order.returnStatus !== "none";
  if (phase === "pickup") {
    if (isReturn) {
      const loc = order?.address?.location;
      if (
        loc &&
        typeof loc.lat === "number" &&
        typeof loc.lng === "number" &&
        Number.isFinite(loc.lat) &&
        Number.isFinite(loc.lng)
      ) {
        return { lat: loc.lat, lng: loc.lng };
      }
      return null;
    }
    return coordsToLatLng(order?.seller?.location?.coordinates);
  }
  if (isReturn) {
    return coordsToLatLng(order?.seller?.location?.coordinates);
  }
  const loc = order?.address?.location;
  if (
    loc &&
    typeof loc.lat === "number" &&
    typeof loc.lng === "number" &&
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng)
  ) {
    return { lat: loc.lat, lng: loc.lng };
  }
  return null;
}

/**
 * Live tracking map: rider + one road route from GET /orders/workflow/:orderId/route.
 * Uses a single native google.maps.Polyline (ref) so the React wrapper cannot leave
 * duplicate overlays. No geodesic rider→dest line — that caused a second “straight” path.
 */
const DeliveryTrackingMapComponent = ({
  orderId,
  phase,
  order,
  onRouteStatsChange,
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const routePolylineRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [zoom, setZoom] = useState(15);
  const [userPanned, setUserPanned] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [rider, setRider] = useState(() => {
    const c = getCachedDeliveryPartnerLocation();
    return c ? { lat: c.lat, lng: c.lng } : null;
  });
  // Initialize riderRef from cache so fetchRoute works immediately on mount
  const riderRef = useRef((() => {
    const c = getCachedDeliveryPartnerLocation();
    return c ? { lat: c.lat, lng: c.lng } : null;
  })());
  const smoothRiderPosRef = useRef(rider);
  const hasFittedInitialBoundsRef = useRef(false);

  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const lastFetchRef = useRef({ at: 0, phase: null, orderId: null });
  const routeOriginRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastLocationPostRef = useRef(0);
  const locationInFlightRef = useRef(false);
  const locationAbortRef = useRef(null);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    const timer = setTimeout(() => {
      if (mapRef.current && window.google) {
        window.google.maps.event.trigger(mapRef.current, "resize");
        const targetPos = smoothRiderPosRef.current || rider;
        if (targetPos) {
          mapRef.current.panTo(targetPos);
        }
      }
    }, 100);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = "";
    };
  }, [isFullscreen, rider]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

  const { isLoaded, loadError } = useJsApiLoader({
    id: "delivery-tracking-map",
    googleMapsApiKey: apiKey,
    libraries,
  });

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const heading = pos.coords.heading;
        const speed = pos.coords.speed;
        
        if (isSimulatingRef.current) return;

        saveDeliveryPartnerLocation(lat, lng);
        setRider({ lat, lng });
        riderRef.current = { lat, lng };
        
        // Throttle location POSTs to once every 5s and skip if one is already in-flight
        const now = Date.now();
        if (now - lastLocationPostRef.current < LOCATION_POST_INTERVAL_MS) return;
        if (locationInFlightRef.current) return;
        lastLocationPostRef.current = now;
        locationInFlightRef.current = true;

        // Abort any previous stale request
        if (locationAbortRef.current) locationAbortRef.current.abort();
        const controller = new AbortController();
        locationAbortRef.current = controller;

        deliveryApi.postLocation(
          { lat, lng, accuracy, heading, speed, orderId: orderId || null },
          { signal: controller.signal, timeout: 8000 },
        ).catch(() => {}).finally(() => {
          locationInFlightRef.current = false;
          if (locationAbortRef.current === controller) locationAbortRef.current = null;
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (locationAbortRef.current) {
        locationAbortRef.current.abort();
        locationAbortRef.current = null;
      }
      locationInFlightRef.current = false;
    };
  }, [orderId]);

  const routeAbortRef = useRef(null);
  const routeInFlightRef = useRef(false);

  const fetchRoute = useCallback(async () => {
    const currentRider = riderRef.current;
    if (!orderId || !currentRider) return;
    if (routeInFlightRef.current) return;
    const now = Date.now();
    const sameRouteContext =
      lastFetchRef.current.phase === phase &&
      lastFetchRef.current.orderId === orderId;
    const originDrift =
      routeOriginRef.current && currentRider
        ? distanceMeters(routeOriginRef.current, currentRider)
        : null;

    if (
      sameRouteContext &&
      lastFetchRef.current.at &&
      now - lastFetchRef.current.at < ROUTE_REFRESH_INTERVAL_MS &&
      (originDrift === null || originDrift < ROUTE_REFRESH_THRESHOLD_M)
    ) {
      return;
    }

    lastFetchRef.current = { at: now, phase, orderId };
    routeInFlightRef.current = true;

    if (routeAbortRef.current) routeAbortRef.current.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;

    setRouteLoading(true);
    try {
      const res = await deliveryApi.getOrderRoute(orderId, {
        phase,
        originLat: currentRider.lat,
        originLng: currentRider.lng,
        _t: now,
      }, { signal: controller.signal });
      if (res.data?.success) {
        const nextRoute = res.data.result || res.data.data || null;
        setRouteData(nextRoute);
        routeOriginRef.current = { lat: currentRider.lat, lng: currentRider.lng };
      }
    } catch {
      setRouteData((prev) => prev || { degraded: true });
    } finally {
      routeInFlightRef.current = false;
      if (routeAbortRef.current === controller) routeAbortRef.current = null;
      setRouteLoading(false);
    }
  // Stable — uses riderRef so GPS ticks don't recreate this callback
  }, [orderId, phase]);

  useEffect(() => {
    setRouteData((prev) => (prev?.phase === phase ? prev : null));
    lastFetchRef.current = { at: 0, phase: null, orderId: null };
    routeOriginRef.current = null;
  }, [orderId, phase]);

  useEffect(() => {
    if (!rider) return undefined;
    fetchRoute();
    const iv = setInterval(fetchRoute, ROUTE_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(iv);
      if (routeAbortRef.current) {
        routeAbortRef.current.abort();
        routeAbortRef.current = null;
      }
      routeInFlightRef.current = false;
    };
  // rider in deps only to trigger initial fetch when location first becomes available
  // fetchRoute is stable (doesn't depend on rider state)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!rider, fetchRoute, phase, orderId]);

  const isReturn = order?.returnStatus && order.returnStatus !== "none";
  // Use order address location, fall back to the destination resolved by the route API
  const dest = useMemo(() => {
    const fromOrder = destinationForPhase(order, phase);
    if (fromOrder) return fromOrder;
    // routeData may contain the resolved destination (set by backend geocode fallback)
    const rd = routeData?.destination;
    if (rd && typeof rd.lat === "number" && typeof rd.lng === "number") {
      return { lat: rd.lat, lng: rd.lng };
    }
    return null;
  }, [order, phase, routeData]);

  useEffect(() => {
    if (typeof onRouteStatsChange !== "function") return undefined;
    onRouteStatsChange({
      phase,
      rider,
      destination: dest,
      routeDurationSeconds: Number(routeData?.duration) || null,
      routeDistanceMeters:
        Number(routeData?.distanceMeters ?? routeData?.distance) || null,
    });
    return undefined;
  }, [onRouteStatsChange, phase, rider, dest, routeData]);

  const decodedPath = useMemo(() => {
    const encoded = routeData?.polyline;
    if (!encoded || !isLoaded || !mapInstance) return null;
    try {
      const decode = window.google?.maps?.geometry?.encoding?.decodePath;
      if (!decode) return null;
      return decode(encoded);
    } catch {
      return null;
    }
  }, [routeData?.polyline, isLoaded, mapInstance]);

  /** Only the road polyline from the API — never a 2-point geodesic “fallback”. */
  const linePath = useMemo(() => {
    if (decodedPath?.length) return decodedPath;
    return [];
  }, [decodedPath]);

  // ─── Normalized rawPath (plain {lat,lng}) ─────────────────────────────────
  const rawPath = useMemo(() => {
    if (!linePath?.length) return [];
    return linePath.map((p) => ({
      lat: typeof p.lat === "function" ? p.lat() : p.lat,
      lng: typeof p.lng === "function" ? p.lng() : p.lng,
    }));
  }, [linePath]);

  // snappedSegIndex as STATE so remainingPath useMemo actually re-runs when it advances
  const [snappedSegIndex, setSnappedSegIndex] = useState(0);
  const snappedSegIndexRef = useRef(0); // mirror ref for use inside effects without deps
  const [snappedRider, setSnappedRider] = useState(null);

  const [isSimulating, setIsSimulating] = useState(false);
  const simulationRef = useRef(null);
  const isSimulatingRef = useRef(false);

  const toggleSimulation = useCallback(() => {
    if (isSimulating) {
      setIsSimulating(false);
      isSimulatingRef.current = false;
      if (simulationRef.current) clearInterval(simulationRef.current);
    } else {
      if (!rawPath || rawPath.length < 2) return;
      setIsSimulating(true);
      isSimulatingRef.current = true;
      let step = snappedSegIndexRef.current || 0;
      simulationRef.current = setInterval(() => {
        if (step >= rawPath.length) {
          setIsSimulating(false);
          isSimulatingRef.current = false;
          clearInterval(simulationRef.current);
          return;
        }
        setRider(rawPath[step]);
        riderRef.current = rawPath[step];
        step++;
      }, 1000);
    }
  }, [isSimulating, rawPath]);

  useEffect(() => {
    return () => {
      if (simulationRef.current) clearInterval(simulationRef.current);
    };
  }, []);

  // Whenever raw rider GPS changes → snap to polyline
  useEffect(() => {
    if (!rider || rawPath.length < 2) {
      setSnappedRider(rider || null);
      return;
    }
    const result = snapToPolyline(rider, rawPath, snappedSegIndexRef.current);
    if (!result) {
      setSnappedRider(rider);
      return;
    }
    const { snapped, segmentIndex, heading } = result;
    // Only advance, never backtrack
    if (segmentIndex > snappedSegIndexRef.current) {
      snappedSegIndexRef.current = segmentIndex;
      setSnappedSegIndex(segmentIndex); // triggers remainingPath recomputation
    }
    setSnappedRider({ ...snapped, heading });
  }, [rider, rawPath]); // intentionally excludes snappedSegIndex to avoid loops

  // Reset when a fresh route arrives
  useEffect(() => {
    snappedSegIndexRef.current = 0;
    setSnappedSegIndex(0);
    setSnappedRider(null);
  }, [routeData?.polyline]);

  // Remaining route = everything from snappedSegIndex forward (polyline trims as rider advances)
  const remainingPath = useMemo(() => {
    if (rawPath.length < 2) return rawPath;
    if (snappedSegIndex <= 0) return rawPath;
    // Prepend snapped position so the line starts exactly at the rider
    return snappedRider
      ? [snappedRider, ...rawPath.slice(snappedSegIndex + 1)]
      : rawPath.slice(snappedSegIndex);
  }, [rawPath, snappedSegIndex, snappedRider]);

  // ─── Polyline rendered natively (updates path in-place, no recreation) ─────
  useEffect(() => {
    if (!isLoaded || !mapInstance || !window.google?.maps) return undefined;

    if (!remainingPath?.length) {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
      return undefined;
    }

    if (routePolylineRef.current) {
      // Update path in-place — avoids flickering from destroy/recreate
      routePolylineRef.current.setPath(remainingPath);
    } else {
      const pl = new window.google.maps.Polyline({
        path: remainingPath,
        strokeColor: "#2563eb",
        strokeOpacity: 0.95,
        strokeWeight: 5,
        map: mapInstance,
        zIndex: 10,
      });
      routePolylineRef.current = pl;
    }

    return () => {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
    };
  }, [isLoaded, mapInstance, remainingPath]);


  // ─── Marker icons ─────────────────────────────────────────────────────────
  const riderMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;
    return {
      url: deliveryIcon,
      scaledSize: new window.google.maps.Size(44, 64),
      anchor: new window.google.maps.Point(22, 64),
    };
  }, [isLoaded]);

  const customerMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;
    return {
      url: customerPin,
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
    };
  }, [isLoaded]);

  const storeMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;
    return {
      url: storePin,
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
    };
  }, [isLoaded]);

  // mapCenter: only used for INITIAL render — camera is controlled imperatively afterwards
  // Do NOT update this after load (would cause Google Maps to re-center and bounce)
  const initialCenter = useMemo(() => {
    if (rider) return rider;
    if (dest) return dest;
    return { lat: 20.5937, lng: 78.9629 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps: intentionally frozen at mount
  const mapCenter = initialCenter;

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
    setMapInstance(map);
  }, []);

  const focusOnRider500m = useCallback((map, riderLocation) => {
    if (!map || !window.google?.maps || !riderLocation) return;
    const center = new window.google.maps.LatLng(riderLocation.lat, riderLocation.lng);
    const bounds = new window.google.maps.LatLngBounds();
    if (window.google.maps.geometry?.spherical?.computeOffset) {
      [0, 90, 180, 270].forEach((h) => {
        bounds.extend(window.google.maps.geometry.spherical.computeOffset(center, RIDER_FOCUS_RADIUS_M, h));
      });
    } else {
      const latOff = RIDER_FOCUS_RADIUS_M / 111111;
      const lngOff = RIDER_FOCUS_RADIUS_M / (111111 * Math.cos((riderLocation.lat * Math.PI) / 180) || 1);
      bounds.extend({ lat: riderLocation.lat + latOff, lng: riderLocation.lng });
      bounds.extend({ lat: riderLocation.lat - latOff, lng: riderLocation.lng });
      bounds.extend({ lat: riderLocation.lat, lng: riderLocation.lng + lngOff });
      bounds.extend({ lat: riderLocation.lat, lng: riderLocation.lng - lngOff });
    }
    map.fitBounds(bounds, 24);
  }, []);

  const handleSmoothRiderPan = useCallback((smoothPos) => {
    smoothRiderPosRef.current = smoothPos;
    if (userPanned) return;
    const map = mapRef.current;
    if (!map || !window.google || !smoothPos) return;

    // Only pan when rider is actually off-screen (prevents the constant map bounce)
    const bounds = map.getBounds();
    if (bounds) {
      const isVisible = bounds.contains({ lat: smoothPos.lat, lng: smoothPos.lng });
      if (!isVisible) {
        map.panTo(smoothPos);
      }
    }
  }, [userPanned]);

  useEffect(() => {
    hasFittedInitialBoundsRef.current = false;
  }, [phase, orderId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google || hasFittedInitialBoundsRef.current) return;

    if (rider) {
      focusOnRider500m(map, rider);
      hasFittedInitialBoundsRef.current = true;
      return;
    }

    try {
      const bounds = new window.google.maps.LatLngBounds();
      if (linePath?.length) {
        linePath.forEach((p) => bounds.extend(p));
      }
      if (rider) bounds.extend(rider);
      if (dest) bounds.extend(dest);
      map.fitBounds(bounds, 32);
      hasFittedInitialBoundsRef.current = true;
    } catch {
      /* ignore */
    }
  }, [linePath, rider, dest, focusOnRider500m]);

  // Auto-pan: only when rider drifts off-screen, not on a fixed timer (timer caused bouncing)
  // This is handled entirely inside handleSmoothRiderPan on each GPS tick.

  // Add resize observer to handle dynamic container height changes without resetting zoom
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return undefined;

    const handleResize = () => {
      window.google.maps.event.trigger(map, 'resize');
    };

    window.addEventListener('resize', handleResize);
    
    const mapContainer = map.getDiv()?.parentElement;
    let resizeObserver;
    
    if (mapContainer && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(mapContainer);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  if (!apiKey) {
    return (
      <div className="relative w-full h-48 bg-slate-100 rounded-2xl flex items-center justify-center text-center px-4">
        <p className="text-xs text-slate-500">
          Set <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> to show live
          tracking.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="relative w-full h-48 bg-rose-50 rounded-2xl flex items-center justify-center text-xs text-rose-700 px-4">
        Map failed to load. Check the API key and billing.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="relative w-full h-48 bg-slate-50 rounded-2xl flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? "fixed inset-0 z-[9999] w-screen h-screen bg-slate-900 flex flex-col overflow-hidden"
          : "relative w-full h-full overflow-hidden bg-slate-100 rounded-3xl"
      }
    >
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapCenter}
        zoom={zoom}
        onLoad={onMapLoad}
        onZoomChanged={() => {
          if (mapRef.current) {
            const z = mapRef.current.getZoom();
            if (typeof z === "number" && z > 0) {
              setZoom(z);
            }
          }
        }}
        onDragStart={() => {
          setUserPanned(true);
        }}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions:
            typeof window !== "undefined" && window.google?.maps?.ControlPosition
              ? { position: window.google.maps.ControlPosition.RIGHT_CENTER }
              : undefined,
          gestureHandling: "greedy",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        }}
      >
        {(snappedRider || rider) && (
          <SmoothRiderMarker
            position={snappedRider || rider}
            title="Your location"
            icon={riderMarkerIcon}
            onPositionUpdate={handleSmoothRiderPan}
          />
        )}
        {dest && (
          <Marker
            position={dest}
            title={
              phase === "pickup"
                ? isReturn
                  ? "Pickup (customer)"
                  : "Pickup (store)"
                : isReturn
                  ? "Drop (seller)"
                  : "Drop (customer)"
            }
            icon={
              phase === "pickup"
                ? isReturn
                  ? customerMarkerIcon
                  : storeMarkerIcon
                : isReturn
                  ? storeMarkerIcon
                  : customerMarkerIcon
            }
          />
        )}
      </GoogleMap>

      {/* Bottom-Right Control Bar: Tracking badge + Mobile Fullscreen button */}
      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2 max-w-[calc(100vw-24px)] select-none">
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={toggleSimulation}
            className={`bg-slate-900/90 hover:bg-slate-900 text-white backdrop-blur-md px-3 py-1.5 rounded-xl shadow-xl border border-slate-700/80 text-[10px] font-bold transition-all cursor-pointer ${isSimulating ? 'text-rose-400' : 'text-sky-400'}`}
          >
            {isSimulating ? "Stop Sim" : "Simulate Rider"}
          </button>
        )}
        <div className="hidden sm:block bg-white/95 backdrop-blur px-2.5 py-1.5 rounded-xl text-[10px] text-slate-700 font-bold border border-slate-200/80 shadow-md">
          {routeLoading ? "Updating route…" : "Tracking View"}
        </div>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="bg-slate-900/90 hover:bg-slate-900 active:scale-95 text-white backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-xl border border-slate-700/80 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all touch-manipulation"
          title={isFullscreen ? "Exit Fullscreen" : "Full Screen Map"}
        >
          {isFullscreen ? (
            <>
              <Minimize2 size={16} className="text-emerald-400" />
              <span>Exit</span>
            </>
          ) : (
            <>
              <Maximize2 size={16} className="text-emerald-400" />
              <span>Full Screen</span>
            </>
          )}
        </button>
      </div>

      {/* Recenter on Rider Button */}
      {userPanned && (
        <button
          type="button"
          onClick={() => {
            setUserPanned(false);
            const map = mapRef.current;
            const targetPos = smoothRiderPosRef.current || rider;
            if (map && targetPos) {
              map.panTo(targetPos);
            }
          }}
          className="absolute top-3 left-3 z-30 flex items-center gap-1.5 bg-white/95 text-slate-800 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md border border-slate-200 text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
        >
          <Navigation size={14} className="text-blue-600 animate-pulse" />
          <span>Recenter on Rider</span>
        </button>
      )}


      {routeData?.degraded && (
        <div className="absolute top-3 left-3 z-20 bg-amber-50/95 text-amber-900 text-[10px] px-2 py-1 rounded border border-amber-200 max-w-[85%] leading-snug">
          Route unavailable. Add{" "}
          <span className="font-mono">GOOGLE_MAPS_API_KEY</span> to the{" "}
          <strong>backend</strong> <span className="font-mono">.env</span>, enable
          Directions API + billing, then restart the API server.
        </div>
      )}
    </div>
  );
}


// Memoized export to prevent unnecessary re-renders and reduce Google Maps API costs
const DeliveryTrackingMap = memo(DeliveryTrackingMapComponent, (prevProps, nextProps) => {
  // Only re-render if these props actually change
  const destPrev = destinationForPhase(prevProps.order, prevProps.phase);
  const destNext = destinationForPhase(nextProps.order, nextProps.phase);
  
  return (
    prevProps.orderId === nextProps.orderId &&
    prevProps.phase === nextProps.phase &&
    destPrev?.lat === destNext?.lat &&
    destPrev?.lng === destNext?.lng
  );
});

DeliveryTrackingMap.displayName = 'DeliveryTrackingMap';

export default DeliveryTrackingMap;
