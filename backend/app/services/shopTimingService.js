/**
 * Utility service for calculating seller shop open/closed status
 * based on operating hours (openingTime, closingTime) and manual override settings.
 */

function parseTimeToMinutes(timeStr, defaultTime) {
  const target = timeStr && typeof timeStr === "string" ? timeStr.trim() : defaultTime;
  const match = target.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
  if (!match) {
    const fallbackMatch = defaultTime.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
    return parseInt(fallbackMatch[1], 10) * 60 + parseInt(fallbackMatch[2], 10);
  }
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function getCurrentTimeInMinutes(date = new Date()) {
  try {
    // Format to HH:mm in Asia/Kolkata (IST)
    const options = { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" };
    const parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(date);
    const hourPart = parts.find((p) => p.type === "hour");
    const minutePart = parts.find((p) => p.type === "minute");
    if (hourPart && minutePart) {
      const hours = parseInt(hourPart.value, 10) % 24;
      const minutes = parseInt(minutePart.value, 10);
      return hours * 60 + minutes;
    }
  } catch (err) {
    // Fallback to local server time
  }
  return date.getHours() * 60 + date.getMinutes();
}

function formatMinutesTo12Hour(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
  return `${hours12}:${minsStr} ${period}`;
}

export function isShopCurrentlyOpen(seller, currentTime = new Date()) {
  if (!seller) return false;
  if (seller.isActive === false) return false;
  if (seller.applicationStatus && seller.applicationStatus !== "approved") return false;

  const shopTiming = seller.shopTiming || {};
  const override = shopTiming.manualOverride || "auto";

  if (override === "open") return true;
  if (override === "closed") return false;

  if (shopTiming.isTimingEnabled === false) return true;

  const openMinutes = parseTimeToMinutes(shopTiming.openingTime, "08:00");
  const closeMinutes = parseTimeToMinutes(shopTiming.closingTime, "20:00");
  const currentMinutes = getCurrentTimeInMinutes(currentTime);

  if (openMinutes === closeMinutes) {
    return true; // 24 hours open
  }

  if (openMinutes < closeMinutes) {
    // Standard daytime timing e.g. 08:00 (480) to 20:00 (1200)
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  } else {
    // Overnight timing e.g. 20:00 (1200) to 04:00 (240)
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }
}

export function getShopStatusMeta(seller, currentTime = new Date()) {
  const isOpen = isShopCurrentlyOpen(seller, currentTime);
  const shopTiming = seller.shopTiming || {};
  const openingTime = shopTiming.openingTime || "08:00";
  const closingTime = shopTiming.closingTime || "20:00";

  const openMinutes = parseTimeToMinutes(openingTime, "08:00");
  const closeMinutes = parseTimeToMinutes(closingTime, "20:00");

  let reason = "";
  if (seller?.isActive === false) {
    reason = "Shop marked inactive by platform or admin";
  } else if (shopTiming.manualOverride === "closed") {
    reason = "Manually closed by seller";
  } else if (shopTiming.manualOverride === "open") {
    reason = "Manually kept open by seller";
  } else if (isOpen) {
    reason = `Open (${formatMinutesTo12Hour(openMinutes)} - ${formatMinutesTo12Hour(closeMinutes)})`;
  } else {
    reason = `Closed outside operating hours (${formatMinutesTo12Hour(openMinutes)} - ${formatMinutesTo12Hour(closeMinutes)})`;
  }

  return {
    isOpen,
    statusLabel: isOpen ? "Open" : "Closed",
    openingTime,
    closingTime,
    formattedOpeningTime: formatMinutesTo12Hour(openMinutes),
    formattedClosingTime: formatMinutesTo12Hour(closeMinutes),
    isTimingEnabled: shopTiming.isTimingEnabled !== false,
    manualOverride: shopTiming.manualOverride || "auto",
    reason,
  };
}
