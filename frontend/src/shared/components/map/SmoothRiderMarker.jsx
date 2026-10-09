import React, { memo, useEffect, useState } from "react";
import { Marker } from "@react-google-maps/api";

// Cache canvases to prevent redrawing the same heading repeatedly
const iconCache = new Map();

const SmoothRiderMarkerComponent = ({
  position,
  icon,
  title = "Delivery Partner",
  zIndex = 100,
  rotationOffset = 0,
  onPositionUpdate,
}) => {
  const [rotatedIcon, setRotatedIcon] = useState(icon);
  const [displayPos, setDisplayPos] = useState(position);
  const currentPosRef = React.useRef(position);

  // Lightweight 60fps butter-smooth interpolation loop
  useEffect(() => {
    if (!position) return;
    
    if (!currentPosRef.current) {
      setDisplayPos(position);
      currentPosRef.current = position;
      return;
    }

    const startLat = currentPosRef.current.lat;
    const startLng = currentPosRef.current.lng;
    const dLat = position.lat - startLat;
    const dLng = position.lng - startLng;
    const distSq = dLat * dLat + dLng * dLng;

    // Skip animation if no movement or huge jump (> ~1km)
    if (distSq === 0 || distSq > 0.0001) {
      setDisplayPos(position);
      currentPosRef.current = position;
      return;
    }

    let startTime = performance.now();
    const duration = 250; // Smooth transition over 250ms (matches simulation tick perfectly)
    let frameId;

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Linear interpolation is optimal for continuous chained movements (avoids start/stop stutter)
      const nextLat = startLat + dLat * progress;
      const nextLng = startLng + dLng * progress;
      
      const nextPos = {
        lat: nextLat,
        lng: nextLng,
        heading: position.heading
      };
      
      setDisplayPos(nextPos);
      currentPosRef.current = nextPos;

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [position?.lat, position?.lng, position?.heading]);

  // When position updates, fire the callback
  useEffect(() => {
    if (displayPos && typeof onPositionUpdate === "function") {
      onPositionUpdate(displayPos);
    }
  }, [displayPos?.lat, displayPos?.lng, displayPos?.heading, onPositionUpdate]);

  // Handle async rotation of the icon
  useEffect(() => {
    if (!icon || !icon.url) return;
    const rawHeading = displayPos?.heading || 0;
    const heading = (rawHeading + rotationOffset + 360) % 360;
    const roundedHeading = Math.round(heading / 2) * 2;
    const cacheKey = `${icon.url}_${roundedHeading}`;

    if (iconCache.has(cacheKey)) {
      setRotatedIcon({ ...icon, ...iconCache.get(cacheKey) });
      return;
    }

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = icon.url;
    img.onload = () => {
      if (!isMounted) return;
      const canvas = document.createElement("canvas");
      // Give padding to avoid clipping during rotation
      const width = icon.scaledSize?.width || img.width;
      const height = icon.scaledSize?.height || img.height;
      const maxSize = Math.max(width, height) * 1.5;
      
      canvas.width = maxSize;
      canvas.height = maxSize;
      const ctx = canvas.getContext("2d");
      
      ctx.translate(maxSize / 2, maxSize / 2);
      ctx.rotate((roundedHeading * Math.PI) / 180);
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
      
      const dataUrl = canvas.toDataURL();
      const newIconProps = {
        url: dataUrl,
        scaledSize: window.google ? new window.google.maps.Size(maxSize, maxSize) : undefined,
        anchor: window.google ? new window.google.maps.Point(maxSize / 2, maxSize / 2) : undefined,
      };
      
      iconCache.set(cacheKey, newIconProps);
      setRotatedIcon({ ...icon, ...newIconProps });
    };

    return () => { isMounted = false; };
  }, [icon, displayPos?.heading, rotationOffset]);

  if (!displayPos) return null;

  return (
    <Marker
      position={displayPos}
      title={title}
      icon={rotatedIcon}
      zIndex={zIndex}
    />
  );
};

export const SmoothRiderMarker = memo(SmoothRiderMarkerComponent);
export default SmoothRiderMarker;

