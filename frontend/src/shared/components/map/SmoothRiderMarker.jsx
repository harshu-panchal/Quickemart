import React, { memo, useEffect } from "react";
import { Marker } from "@react-google-maps/api";
import { useSmoothLocation } from "@/shared/hooks/useSmoothLocation";

const SmoothRiderMarkerComponent = ({
  position,
  icon,
  title = "Delivery Partner",
  zIndex = 100,
  onPositionUpdate,
}) => {
  const { smoothLocation, heading, isMoving } = useSmoothLocation(position);

  useEffect(() => {
    if (smoothLocation && typeof onPositionUpdate === "function") {
      onPositionUpdate(smoothLocation);
    }
  }, [smoothLocation?.lat, smoothLocation?.lng, onPositionUpdate]);

  if (!smoothLocation) return null;

  return (
    <Marker
      position={smoothLocation}
      title={title}
      icon={icon}
      zIndex={zIndex}
    />
  );
};

export const SmoothRiderMarker = memo(SmoothRiderMarkerComponent);
export default SmoothRiderMarker;
