import { isSupported, getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirebaseApp } from "./client";
import axiosInstance from "@core/api/axios";
import AppZetoBridge from "../../lib/appZetoBridge";
import { rawGet, rawSet, rawRemove, KEY_PREFIXES, STORAGE_KEYS } from "@core/utils/storage";
import {
  isProductionFCMEnvironment,
  getFCMEnvironment,
  getClientOrigin,
} from "./fcmEnvironment";

function maskToken(token = "") {
  const str = String(token || "");
  return str.length > 13 ? `${str.substring(0, 10)}...` : str;
}

let foregroundListenerStarted = false;
let foregroundUnsubscribe = null;
const GESTURE_EVENTS = ["pointerdown", "touchstart", "click", "keydown"];
const gestureHandlers = new Map();

let inFlightRegistrations = new Map();

/**
 * Delete all stale Firebase IndexedDB databases.
 * Called automatically when an IndexedDB version conflict error is detected.
 * Unregisters any active service workers first so they don't hold database locks.
 */
async function clearFirebaseIndexedDbs() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
      }
    } catch (_) {}
  }

  const knownDbs = new Set([
    "firebase-messaging-database",
    "firebase-installations-database",
    "firebase-heartbeat-database",
    "fcm_token_details_db",
    "fcm_vapid_details_db",
  ]);

  if (typeof indexedDB !== "undefined" && typeof indexedDB.databases === "function") {
    try {
      const list = await indexedDB.databases();
      for (const db of list) {
        if (db.name && (db.name.toLowerCase().includes("firebase") || db.name.toLowerCase().includes("fcm"))) {
          knownDbs.add(db.name);
        }
      }
    } catch (_) {}
  }

  await Promise.allSettled(
    Array.from(knownDbs).map(
      (name) =>
        new Promise((resolve) => {
          try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => {
              console.log(`[FCM] Deleted IndexedDB: ${name}`);
              resolve();
            };
            req.onerror = () => {
              console.warn(`[FCM] Could not delete IndexedDB: ${name}`);
              resolve();
            };
            req.onblocked = () => {
              console.warn(`[FCM] Delete blocked for IndexedDB: ${name}`);
              resolve();
            };
            setTimeout(resolve, 1500);
          } catch (_) {
            resolve();
          }
        })
    )
  );
}


function registeredKey(role = "customer") {
  return `${KEY_PREFIXES.PUSH_REGISTERED}${String(role || "customer").toLowerCase()}`;
}

function tokenKey(role = "customer") {
  return `${KEY_PREFIXES.PUSH_FCM_TOKEN}${String(role || "customer").toLowerCase()}`;
}

export function hasRegisteredFcmToken(role = "customer") {
  return rawGet(registeredKey(role), { storage: "session" }) === "1";
}

export function getStoredFcmToken(role = "customer") {
  return rawGet(tokenKey(role)) || "";
}

export function clearStoredFcmToken(role = "customer") {
  rawRemove(tokenKey(role));
  rawRemove(registeredKey(role), { storage: "session" });
}

function persistStoredFcmToken(role = "customer", token = "") {
  if (!token) return;
  rawSet(tokenKey(role), token);
  rawSet(registeredKey(role), "1", { storage: "session" });
}

export function describePushSupport() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { supported: false, reason: "no-window" };
  }

  if (!window.isSecureContext) {
    return { supported: false, reason: "insecure-context" };
  }

  const ua = String(navigator.userAgent || "");
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;

  if (isIOS && isSafari && !isStandalone) {
    return {
      supported: false,
      reason: "ios-safari-not-standalone",
      message: "On iPhone/iPad Safari, push notifications work only after installing the app to Home Screen.",
    };
  }

  if (window.Flutter) {
    return { supported: true, reason: "flutter-native" };
  }

  return { supported: true, reason: "ok" };
}

async function ensureServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser");
  }
  const swUrl = "/firebase-messaging-sw.js";

  // Detect broken SPA hosting rewrites where SW URL serves index.html.
  try {
    const swResponse = await fetch(swUrl, { cache: "no-store" });
    if (!swResponse.ok) {
      throw new Error(`Service worker script not reachable (${swResponse.status})`);
    }
    const contentType = String(swResponse.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html")) {
      throw new Error(
        "Service worker URL returned HTML. Check production rewrites and exclude /firebase-messaging-sw.js from SPA fallback.",
      );
    }
  } catch (error) {
    throw new Error(error?.message || "Unable to validate service worker script");
  }

  // Must be at site root for FCM web push.
  const registration = await navigator.serviceWorker.register(swUrl, {
    updateViaCache: "none",
  });

  // Guard update() and ready with timeouts so service worker never hangs registration
  try {
    await Promise.race([
      registration.update(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("SW update timeout")), 3000)),
    ]);
  } catch (err) {
    console.warn("[FCM] SW update non-fatal note:", err?.message || err);
  }

  try {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("SW ready timeout")), 4000)),
    ]);
  } catch (err) {
    console.warn("[FCM] SW ready non-fatal note:", err?.message || err);
  }

  // Ensure the installing/waiting worker actually activates so getToken doesn't stall
  if (!registration.active) {
    const candidate = registration.installing || registration.waiting;
    if (candidate) {
      await new Promise((resolve) => {
        const onState = () => {
          if (candidate.state === "activated" || candidate.state === "redundant") {
            candidate.removeEventListener("statechange", onState);
            resolve();
          }
        };
        candidate.addEventListener("statechange", onState);
        setTimeout(resolve, 3000);
      });
    }
  }

  return registration;
}

export async function showSystemNotification({ title, body, data } = {}) {
  // Never show OS-level notification banner from non-production origin
  if (!isProductionFCMEnvironment()) {
    console.log("[FCM] Suppressed OS-level notification in development environment");
    return;
  }

  const safeTitle = String(title || "Notification");
  const safeBody = String(body || "");
  const link = data?.link || "/";
  const tag = data?.orderId || data?.eventType || "quick-commerce";
  const image = String(data?.image || data?.imageUrl || "").trim();

  // Prefer SW notifications so they land in the OS notification center consistently.
  try {
    const swPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("SW ready timeout")), 1500)
    );
    const reg = await Promise.race([swPromise, timeoutPromise]);
    if (reg?.showNotification) {
      await reg.showNotification(safeTitle, {
        body: safeBody,
        tag,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [200, 100, 200],
        requireInteraction: true,
        renotify: true,
        silent: false,
        actions: [
          { action: "view", title: "View" },
          { action: "dismiss", title: "Dismiss" },
        ],
        ...(image ? { image } : {}),
        data: {
          link,
          orderId: data?.orderId || "",
          eventType: data?.eventType || "",
          image,
        },
      });
      return;
    }
  } catch {
    // fallback below
  }

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    const n = new Notification(safeTitle, {
      body: safeBody,
      tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      requireInteraction: true,
      renotify: true,
      silent: false,
      ...(image ? { image } : {}),
      data: {
        link,
        orderId: data?.orderId || "",
        eventType: data?.eventType || "",
        image,
      },
    });
    n.onclick = (e) => {
      e.preventDefault();
      try {
        window.focus();
      } catch (err) {
        // ignore focus error
      }
      window.location.href = link;
      n.close();
    };
  }
}

export async function ensureFcmTokenRegistered({
  role = "customer",
  platform,
  device = "",
} = {}) {
  const normRole = String(role || "customer").toLowerCase();
  if (inFlightRegistrations.has(normRole)) {
    console.log(`[FCM] Reusing in-flight registration for role=${normRole}`);
    return inFlightRegistrations.get(normRole);
  }

  const registrationPromise = (async () => {
    // Auto-detect platform: Flutter mobile app → 'app', browser → 'web'
    const resolvedPlatform = platform || (window.Flutter ? "app" : "web");
    console.log(`[FCM] Starting registration: role=${normRole}, platform=${resolvedPlatform}`);

    const support = describePushSupport();
    if (!support.supported) {
      console.warn(`[FCM] Push not supported: ${support.reason} - ${support.message || ""}`);
      throw new Error(support.message || `Push unsupported: ${support.reason}`);
    }

    if (!window.Flutter) {
      const supported = await isSupported().catch(() => false);
      if (!supported) {
        console.warn("[FCM] Firebase Messaging not supported in this browser");
        throw new Error("Firebase Messaging is not supported in this environment");
      }
    }

    let token = "";

    if (window.Flutter) {
      console.log("[FCM] Getting token from Flutter native layer...");
      token = await AppZetoBridge.getFcmToken();
      if (!token) {
        throw new Error("Failed to obtain native FCM token from Flutter");
      }
      console.log("[FCM] Got Flutter token:", token.substring(0, 20) + "...");
    } else {
      const app = getFirebaseApp();
      if (!app) {
        console.error("[FCM] Firebase app not initialized — check VITE_FIREBASE_* env vars");
        throw new Error("Firebase is not configured (missing VITE_FIREBASE_* env)");
      }

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        console.error("[FCM] Missing VITE_FIREBASE_VAPID_KEY");
        throw new Error("Missing VITE_FIREBASE_VAPID_KEY");
      }

      console.log("[FCM] Requesting notification permission...");
      const permission = await Notification.requestPermission();
      console.log("[FCM] Permission result:", permission);
      if (permission !== "granted") {
        throw new Error("Notification permission not granted");
      }

      console.log("[FCM] Registering service worker...");
      const swRegistration = await ensureServiceWorkerRegistration();
      console.log("[FCM] Service worker ready, getting FCM token...");
      const messaging = getMessaging(app);

      const fetchTokenWithTimeout = (reg) => {
        const tokenPromise = getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("FCM getToken timed out after 15 seconds")), 15000)
        );
        return Promise.race([tokenPromise, timeoutPromise]);
      };

      try {
        token = await fetchTokenWithTimeout(swRegistration);
      } catch (idbErr) {
        if (String(idbErr?.message || "").toLowerCase().includes("version")) {
          console.warn("[FCM] IndexedDB version conflict detected — clearing stale DBs and resetting SW...");
          await clearFirebaseIndexedDbs();
          const reloadKey = "fcm:idb_version_recovered";
          if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(reloadKey)) {
            sessionStorage.setItem(reloadKey, "1");
            console.log("[FCM] Reloading page to apply clean IndexedDB state...");
            window.location.reload();
            return "";
          }
          const freshSwReg = await ensureServiceWorkerRegistration();
          token = await fetchTokenWithTimeout(freshSwReg);
        } else {
          throw idbErr;
        }
      }

      if (!token) {
        throw new Error("Failed to obtain FCM token");
      }
      console.log("[FCM] Got browser FCM token:", maskToken(token));
    }

    const ROLE_TO_STORAGE_KEY = {
      seller: STORAGE_KEYS.AUTH_SELLER,
      admin: STORAGE_KEYS.AUTH_ADMIN,
      delivery: STORAGE_KEYS.AUTH_DELIVERY,
      customer: STORAGE_KEYS.AUTH_CUSTOMER,
    };
    const { getStoredAuthToken } = await import("@core/utils/authStorage");
    const storageKey = ROLE_TO_STORAGE_KEY[normRole];
    let roleToken = storageKey ? getStoredAuthToken(storageKey) : null;
    if (!roleToken) {
      roleToken = getStoredAuthToken(STORAGE_KEYS.AUTH_LEGACY) || getStoredAuthToken("token");
    }
    const headers = {};
    if (roleToken) {
      headers.Authorization = `Bearer ${roleToken}`;
    }

    const env = getFCMEnvironment();
    const origin = getClientOrigin();

    console.log(`[FCM] Environment: ${env}`);
    console.log(`[FCM] Origin: ${origin || "unknown"}`);

    if (!isProductionFCMEnvironment()) {
      console.log("[FCM] Development origin detected. Skipping production FCM registration.");
      persistStoredFcmToken(normRole, token);
      return token;
    }

    console.log("[FCM] Environment: production");
    console.log("[FCM] Registering production FCM token");
    try {
      await axiosInstance.post("/push/register", {
        token,
        platform: resolvedPlatform,
        device: device || navigator.userAgent,
        origin,
        environment: "production",
      }, {
        headers,
      });
      console.log("[FCM] /push/register SUCCESS — token saved in DB");
    } catch (apiErr) {
      console.error("[FCM] /push/register FAILED:", apiErr?.response?.status, apiErr?.response?.data || apiErr.message);
      throw apiErr;
    }

    persistStoredFcmToken(normRole, token);
    return token;
  })();

  inFlightRegistrations.set(normRole, registrationPromise);
  try {
    return await registrationPromise;
  } finally {
    inFlightRegistrations.delete(normRole);
  }
}

export function scheduleFcmRegistrationOnUserGesture({
  role = "customer",
  platform = "web",
  device = "",
  onSuccess,
  onError,
} = {}) {
  if (typeof window === "undefined") return () => {};
  const key = String(role || "customer").toLowerCase();

  // Avoid duplicate listener stacks for the same role.
  const existingCleanup = gestureHandlers.get(key);
  if (existingCleanup) {
    return existingCleanup;
  }

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    for (const eventName of GESTURE_EVENTS) {
      window.removeEventListener(eventName, handler, true);
    }
    gestureHandlers.delete(key);
  };

  let isAttempting = false;
  const handler = async () => {
    if (isAttempting) return;
    isAttempting = true;
    try {
      const token = await ensureFcmTokenRegistered({ role: key, platform, device });
      remove();
      if (typeof onSuccess === "function") onSuccess(token);
    } catch (error) {
      console.warn(`[FCM] Gesture registration attempt failed, will retry on next user interaction:`, error?.message || error);
      if (typeof onError === "function") onError(error);
    } finally {
      isAttempting = false;
    }
  };

  for (const eventName of GESTURE_EVENTS) {
    window.addEventListener(eventName, handler, { capture: true, passive: true });
  }

  gestureHandlers.set(key, remove);
  return remove;
}

export async function removeStoredFcmToken({
  role = "customer",
  token = "",
} = {}) {
  const candidateToken = String(token || getStoredFcmToken(role) || "").trim();
  if (!candidateToken) {
    clearStoredFcmToken(role);
    return false;
  }

  const ROLE_TO_STORAGE_KEY = {
    seller: STORAGE_KEYS.AUTH_SELLER,
    admin: STORAGE_KEYS.AUTH_ADMIN,
    delivery: STORAGE_KEYS.AUTH_DELIVERY,
    customer: STORAGE_KEYS.AUTH_CUSTOMER,
  };
  const { getStoredAuthToken } = await import("@core/utils/authStorage");
  const storageKey = ROLE_TO_STORAGE_KEY[role];
  const roleToken = storageKey ? getStoredAuthToken(storageKey) : null;
  const headers = {};
  if (roleToken) {
    headers.Authorization = `Bearer ${roleToken}`;
  }

  await axiosInstance.delete("/push/remove", {
    data: {
      token: candidateToken,
    },
    headers,
  });

  clearStoredFcmToken(role);
  return true;
}

export async function startForegroundPushListener() {
  if (foregroundListenerStarted && foregroundUnsubscribe) {
    return foregroundUnsubscribe;
  }

  if (!window.Flutter) {
    const supported = await isSupported().catch(() => false);
    if (!supported) return () => {};
  }

  const app = getFirebaseApp();
  if (!app && !window.Flutter) return () => {};

  // If in Flutter, the native app handles foreground notifications, 
  // but we can still return a dummy unsubscribe.
  if (window.Flutter) {
    return () => {};
  }

  // Ensure SW exists (helps with consistent notification center behavior).
  try {
    await ensureServiceWorkerRegistration();
  } catch {
    // ignore
  }

  const messaging = getMessaging(app);
  const unsubscribe = onMessage(messaging, async (payload) => {
    console.log("[PushClient] Foreground push notification received:", payload);
    const title =
      payload?.notification?.title || payload?.data?.title || "Notification";
    const body =
      payload?.notification?.body || payload?.data?.body || "";

    // 1. Play standard Mixkit notification chime sound
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(() => {});
    } catch (e) {
      // Ignore audio playback failure (e.g. browser autoplay restrictions)
    }

    // 2. Surfaced as a styled toast notification using Sonner
    try {
      const { toast } = await import('sonner');
      const link = payload?.data?.link;
      toast(title, {
        description: body,
        duration: 8000,
        position: 'top-center',
        action: link ? {
          label: 'View',
          onClick: () => {
            window.location.href = link;
          }
        } : undefined
      });
    } catch (e) {
      // Ignore toast trigger failures
    }

    // 3. Fallback to system-level tray notification
    await showSystemNotification({
      title,
      body,
      data: payload?.data || {},
    });
  });

  foregroundListenerStarted = true;
  foregroundUnsubscribe = unsubscribe;
  return unsubscribe;
}

export {
  isProductionFCMEnvironment,
  getFCMEnvironment,
  getClientOrigin,
};

export default {
  describePushSupport,
  clearStoredFcmToken,
  ensureFcmTokenRegistered,
  getStoredFcmToken,
  hasRegisteredFcmToken,
  removeStoredFcmToken,
  scheduleFcmRegistrationOnUserGesture,
  startForegroundPushListener,
  showSystemNotification,
  isProductionFCMEnvironment,
  getFCMEnvironment,
  getClientOrigin,
};
