/**
 * Centralized FCM Environment Helper
 * Determines whether the current client environment is production or development,
 * and whether FCM push token registration and notification display should occur.
 */

export const PRODUCTION_ORIGIN = "https://quickemartcom.com";

/**
 * Returns the current window origin safely.
 */
export function getClientOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

/**
 * Determines whether a given origin belongs to local development.
 */
export function isLocalhostOrigin(origin = getClientOrigin()) {
  if (!origin) return false;
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(origin);
}

/**
 * Checks if the configured API URL points to the production server.
 */
export function isProductionApi(apiUrl = import.meta.env?.VITE_API_URL || "") {
  if (!apiUrl) return false;
  return !isLocalhostOrigin(apiUrl) && apiUrl.includes("quickemartcom.com");
}

/**
 * Resolves the FCM environment string: 'production' | 'development' | 'staging'
 */
export function getFCMEnvironment() {
  const origin = getClientOrigin();
  if (isLocalhostOrigin(origin)) {
    return "development";
  }
  if (origin === PRODUCTION_ORIGIN || origin.includes("quickemartcom.com")) {
    return "production";
  }
  return import.meta.env?.MODE === "production" ? "production" : "development";
}

/**
 * Centralized boolean: returns true ONLY when running on the production origin/environment.
 */
export function isProductionFCMEnvironment() {
  return getFCMEnvironment() === "production";
}

export default {
  PRODUCTION_ORIGIN,
  getClientOrigin,
  isLocalhostOrigin,
  isProductionApi,
  getFCMEnvironment,
  isProductionFCMEnvironment,
};
