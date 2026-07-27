const DEFAULT_API_PORT = "7000";
const DEFAULT_API_PATH = "/api";

function normalizeOrigin(origin) {
  return origin.replace(/\/+$/, "");
}

function ensureApiPath(pathname) {
  if (!pathname || pathname === "/") return DEFAULT_API_PATH;
  return pathname.endsWith("/api") ? pathname : `${pathname.replace(/\/+$/, "")}/api`;
}

function buildLocalApiUrl(hostname) {
  const protocol = window.location.protocol || "http:";
  return `${protocol}//${hostname}:${DEFAULT_API_PORT}${DEFAULT_API_PATH}`;
}

function parseEnvUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return `${normalizeOrigin(parsed.origin)}${ensureApiPath(parsed.pathname)}`;
  } catch {
    return null;
  }
}

function isLocalUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.startsWith("172.")
    );
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl() {
  const envUrl =
    parseEnvUrl(import.meta.env.VITE_API_URL) ||
    parseEnvUrl(import.meta.env.VITE_API_BASE_URL);

  const browserHostname = window.location.hostname;
  const isCurrentLocal =
    browserHostname === "localhost" ||
    browserHostname === "127.0.0.1" ||
    browserHostname === "[::1]";

  // If we are running on a remote live site (or remote dev network IP), but the envUrl
  // points to localhost/127.0.0.1, we ignore the local envUrl and use the current page's origin.
  const shouldIgnoreLocalEnv = !isCurrentLocal && envUrl && isLocalUrl(envUrl);

  if (!envUrl || shouldIgnoreLocalEnv) {
    const fallbackHost = browserHostname || "localhost";
    if (isCurrentLocal) {
      return buildLocalApiUrl(fallbackHost);
    }
    const protocol = window.location.protocol || "https:";
    return `${protocol}//${browserHostname}${DEFAULT_API_PATH}`;
  }

  try {
    const parsed = new URL(envUrl);
    return `${normalizeOrigin(parsed.origin)}${ensureApiPath(parsed.pathname)}`;
  } catch {
    const fallbackHost = browserHostname || "localhost";
    return buildLocalApiUrl(fallbackHost);
  }
}

export function resolveSocketBaseUrl() {
  const explicitSocketUrl = parseEnvUrl(import.meta.env.VITE_SOCKET_URL);
  if (explicitSocketUrl) {
    return explicitSocketUrl.replace(/\/api$/, "");
  }
  return resolveApiBaseUrl().replace(/\/api$/, "");
}
