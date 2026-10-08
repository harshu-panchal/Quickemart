import { useEffect, useRef, useState } from "react";

function getDistanceMeters(p1, p2) {
  if (
    !p1 ||
    !p2 ||
    !Number.isFinite(p1.lat) ||
    !Number.isFinite(p1.lng) ||
    !Number.isFinite(p2.lat) ||
    !Number.isFinite(p2.lng)
  ) {
    return 0;
  }
  const R = 6371000;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getBearingDegrees(p1, p2) {
  if (!p1 || !p2) return 0;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Custom hook to smoothly interpolate and dead-reckon live marker location.
 *
 * @param {{ lat: number, lng: number } | null} targetLocation - The latest raw GPS/Socket location update
 * @param {Object} options
 * @param {number} [options.defaultDurationMs=4000] - Duration to interpolate to target
 * @param {boolean} [options.enableDeadReckoning=true] - Simulate forward motion if updates lag
 * @returns {{ smoothLocation: { lat: number, lng: number } | null, heading: number, isMoving: boolean }}
 */
export function useSmoothLocation(targetLocation, options = {}) {
  const { defaultDurationMs = 4000, enableDeadReckoning = true } = options;

  const [smoothLocation, setSmoothLocation] = useState(() => {
    if (
      targetLocation &&
      Number.isFinite(targetLocation.lat) &&
      Number.isFinite(targetLocation.lng)
    ) {
      return { lat: Number(targetLocation.lat), lng: Number(targetLocation.lng) };
    }
    return null;
  });

  const [heading, setHeading] = useState(0);
  const [isMoving, setIsMoving] = useState(false);

  // Animation state stored in refs for 60fps performance without re-render thrashing
  const currentRenderRef = useRef(
    targetLocation &&
      Number.isFinite(targetLocation.lat) &&
      Number.isFinite(targetLocation.lng)
      ? { lat: Number(targetLocation.lat), lng: Number(targetLocation.lng) }
      : null
  );
  const startLocRef = useRef(null);
  const targetLocRef = useRef(null);
  const startTimeRef = useRef(0);
  const durationRef = useRef(defaultDurationMs);
  const velocityRef = useRef({ dLat: 0, dLng: 0, speedMps: 0 });
  const animFrameRef = useRef(null);
  const lastTargetTimeRef = useRef(Date.now());

  // Handle incoming raw targetLocation changes
  useEffect(() => {
    if (
      !targetLocation ||
      !Number.isFinite(targetLocation.lat) ||
      !Number.isFinite(targetLocation.lng)
    ) {
      return;
    }

    const newTarget = {
      lat: Number(targetLocation.lat),
      lng: Number(targetLocation.lng),
    };
    const now = Date.now();

    // Initial position fix
    if (!currentRenderRef.current) {
      currentRenderRef.current = newTarget;
      targetLocRef.current = newTarget;
      setSmoothLocation(newTarget);
      lastTargetTimeRef.current = now;
      return;
    }

    const distMeters = getDistanceMeters(currentRenderRef.current, newTarget);

    // If target location hasn't changed noticeably, skip
    if (distMeters < 0.3) {
      return;
    }

    // Teleport threshold: if distance > 5km, snap immediately without animating across map
    if (distMeters > 5000) {
      currentRenderRef.current = newTarget;
      targetLocRef.current = newTarget;
      startLocRef.current = newTarget;
      velocityRef.current = { dLat: 0, dLng: 0, speedMps: 0 };
      setSmoothLocation(newTarget);
      lastTargetTimeRef.current = now;
      setIsMoving(false);
      return;
    }

    // Calculate time elapsed since last target update
    const timeSinceLastTarget = Math.max(1000, now - lastTargetTimeRef.current);
    lastTargetTimeRef.current = now;

    // Set duration to match update frequency (bounded between 1.5s and 5s)
    const duration = Math.min(Math.max(timeSinceLastTarget, 1500), 5000);

    const startLoc = { ...currentRenderRef.current };
    startLocRef.current = startLoc;
    targetLocRef.current = newTarget;
    startTimeRef.current = now;
    durationRef.current = duration;

    // Calculate velocity vector (degrees per millisecond) & speed in m/s
    const dLat = (newTarget.lat - startLoc.lat) / duration;
    const dLng = (newTarget.lng - startLoc.lng) / duration;
    const speedMps = distMeters / (duration / 1000);

    velocityRef.current = { dLat, dLng, speedMps };

    // Calculate bearing
    const brng = getBearingDegrees(startLoc, newTarget);
    setHeading(brng);
    setIsMoving(true);
  }, [targetLocation?.lat, targetLocation?.lng]);

  // Main 60fps animation loop
  useEffect(() => {
    let lastFrameTime = performance.now();

    const animate = (nowTime) => {
      const deltaMs = Math.min(nowTime - lastFrameTime, 100);
      lastFrameTime = nowTime;

      if (
        startLocRef.current &&
        targetLocRef.current &&
        currentRenderRef.current
      ) {
        const now = Date.now();
        const elapsed = now - startTimeRef.current;
        const duration = durationRef.current;

        let nextLat, nextLng;

        if (elapsed <= duration) {
          // Phase 1: Smooth interpolation (Ease-Out Linear Blend)
          const progress = elapsed / duration;
          const easeProgress = progress * (2 - progress);

          nextLat =
            startLocRef.current.lat +
            (targetLocRef.current.lat - startLocRef.current.lat) * easeProgress;
          nextLng =
            startLocRef.current.lng +
            (targetLocRef.current.lng - startLocRef.current.lng) * easeProgress;
        } else if (
          enableDeadReckoning &&
          velocityRef.current.speedMps > 0.5
        ) {
          // Phase 2: Dead-Reckoning Simulation (Vehicle moving in same direction)
          // Continue moving forward along current velocity vector, decaying smoothly
          const overtimeMs = elapsed - duration;
          const decay = Math.max(0, 1 - overtimeMs / 5000);

          if (decay > 0.05) {
            nextLat =
              currentRenderRef.current.lat +
              velocityRef.current.dLat * deltaMs * decay;
            nextLng =
              currentRenderRef.current.lng +
              velocityRef.current.dLng * deltaMs * decay;
          } else {
            nextLat = currentRenderRef.current.lat;
            nextLng = currentRenderRef.current.lng;
            setIsMoving(false);
          }
        } else {
          nextLat = targetLocRef.current.lat;
          nextLng = targetLocRef.current.lng;
          setIsMoving(false);
        }

        currentRenderRef.current = { lat: nextLat, lng: nextLng };
        setSmoothLocation({ lat: nextLat, lng: nextLng });
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [enableDeadReckoning]);

  return { smoothLocation, heading, isMoving };
}

export default useSmoothLocation;
