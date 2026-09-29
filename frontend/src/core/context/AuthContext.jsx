import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import axiosInstance from '@core/api/axios';
import { getWithDedupe } from '@core/api/dedupe';
import { getStoredAuthToken } from '@core/utils/authStorage';
import {
    getActiveRole,
    subscribeActiveRole,
} from '@core/auth/activeRoleStore';
import {
    rawGet,
    rawSet,
    rawRemove,
    clearOnLogout,
    STORAGE_KEYS,
} from '@core/utils/storage';

const AuthContext = createContext(undefined);

const ROLE_STORAGE_KEYS = {
    customer: STORAGE_KEYS.AUTH_CUSTOMER,
    seller: STORAGE_KEYS.AUTH_SELLER,
    admin: STORAGE_KEYS.AUTH_ADMIN,
    product: STORAGE_KEYS.AUTH_ADMIN,
    delivery: STORAGE_KEYS.AUTH_DELIVERY,
};

const LEGACY_TOKEN_KEY = STORAGE_KEYS.AUTH_LEGACY;

export const AuthProvider = ({ children }) => {
    const getSafeToken = (key) => getStoredAuthToken(ROLE_STORAGE_KEYS[key]);

    const [authData, setAuthData] = useState({
        customer: getSafeToken('customer'),
        seller: getSafeToken('seller'),
        admin: getSafeToken('admin'),
        delivery: getSafeToken('delivery'),
    });

    // Subscribe to the activeRoleStore so this context re-renders whenever the
    // router flips the active portal. The store also falls back to URL
    // inference on first read, so behavior matches the previous implementation
    // before any router has explicitly set a role.
    const [currentRole, setCurrentRole] = useState(getActiveRole());
    useEffect(() => {
        const unsub = subscribeActiveRole((next) => setCurrentRole(next));
        return unsub;
    }, []);

    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const token = authData[currentRole];
    const isAuthenticated = !!token;

    useEffect(() => {
        const syncStoredTokens = () => {
            setAuthData({
                customer: getSafeToken('customer'),
                seller: getSafeToken('seller'),
                admin: getSafeToken('admin'),
                delivery: getSafeToken('delivery'),
            });
        };

        window.addEventListener('focus', syncStoredTokens);
        window.addEventListener('storage', syncStoredTokens);
        document.addEventListener('visibilitychange', syncStoredTokens);

        return () => {
            window.removeEventListener('focus', syncStoredTokens);
            window.removeEventListener('storage', syncStoredTokens);
            document.removeEventListener('visibilitychange', syncStoredTokens);
        };
    }, []);

    // Helper: register FCM token for a specific role immediately after login/signup.
    // Called directly with the resolved role so there is no delay waiting for
    // the activeRoleStore to propagate via useEffect.
    const triggerFcmRegistration = (role) => {
        setTimeout(() => {
            import('@core/firebase/pushClient')
                .then(async ({
                    ensureFcmTokenRegistered,
                    hasRegisteredFcmToken,
                    startForegroundPushListener,
                    scheduleFcmRegistrationOnUserGesture,
                }) => {
                    await startForegroundPushListener();
                    if (hasRegisteredFcmToken(role)) return;

                    const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';

                    if (permission === 'granted' || permission === 'default') {
                        try {
                            // platform is auto-detected inside ensureFcmTokenRegistered
                            await ensureFcmTokenRegistered({ role });
                            return;
                        } catch (err) {
                            console.warn('[push] Immediate registration failed, falling back to gesture:', err?.message || err);
                        }
                    }

                    // Denied or immediate attempt failed — wait for next user gesture
                    scheduleFcmRegistrationOnUserGesture({
                        role,
                        onError: (error) => {
                            console.warn('[push] Deferred registration failed:', error?.message || error);
                        },
                    });
                })
                .catch((error) => {
                    console.warn('[push] Auto-registration skipped:', error?.message || error);
                });
        }, 0);
    };

    // On page reload: user already has a token in localStorage → re-register FCM
    // (token may have rotated, or the DB record may have been cleaned up).
    useEffect(() => {
        if (!token) return;
        let cleanupDeferredRegistration = null;
        let cancelled = false;

        setTimeout(() => {
            import('@core/firebase/pushClient')
                .then(async ({
                    ensureFcmTokenRegistered,
                    hasRegisteredFcmToken,
                    startForegroundPushListener,
                    scheduleFcmRegistrationOnUserGesture,
                }) => {
                    if (cancelled) return;
                    await startForegroundPushListener();
                    // Skip if already registered in this session
                    if (hasRegisteredFcmToken(currentRole)) return;

                    const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';

                    if (permission === 'granted' || permission === 'default') {
                        try {
                            await ensureFcmTokenRegistered({ role: currentRole });
                            return;
                        } catch (err) {
                            console.warn('[push] Page-reload FCM registration failed, waiting for gesture:', err?.message || err);
                        }
                    }

                    cleanupDeferredRegistration = scheduleFcmRegistrationOnUserGesture({
                        role: currentRole,
                        onError: (error) => {
                            console.warn('[push] Deferred registration failed:', error?.message || error);
                        },
                    });
                })
                .catch((error) => {
                    console.warn('[push] Auto-registration skipped:', error?.message || error);
                });
        }, 0);

        return () => {
            cancelled = true;
            if (typeof cleanupDeferredRegistration === 'function') {
                cleanupDeferredRegistration();
            }
        };
    }, [token, currentRole]);


    // Fetch user profile on mount or token change
    useEffect(() => {
        const fetchProfile = async () => {
            if (token) {
                try {
                    setIsLoading(true);
                    // Use deduplicated fetch to avoid multiple simultaneous profile calls
                    const portalRole = (currentRole === 'admin' || currentRole === 'product') ? 'admin' : currentRole;
                    const endpoint = `/${portalRole}/profile`;
                    const response = await getWithDedupe(endpoint, {}, { ttl: 5000 });
                    setUser(response.data.result);
                } catch (error) {
                    console.error('Failed to fetch profile:', error);
                    // Preserve stored tokens on request failures; only manual logout clears auth storage.
                    setUser(null);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setUser(null);
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, [token, currentRole]);

    // Listen to real-time socket events for system notification fallback
    useEffect(() => {
        if (!token) return;

        // Auto-request HTML5 desktop notification permissions on the first user interaction
        const handleGesture = () => {
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                Notification.requestPermission().catch(() => {});
            }
            // Remove listeners
            const gestureEvents = ["pointerdown", "touchstart", "click", "keydown"];
            gestureEvents.forEach(event => {
                document.removeEventListener(event, handleGesture);
            });
        };

        if (typeof Notification !== 'undefined') {
            if (Notification.permission === 'default') {
                const gestureEvents = ["pointerdown", "touchstart", "click", "keydown"];
                gestureEvents.forEach(event => {
                    document.addEventListener(event, handleGesture, { once: true });
                });
            }
        }

        const handleNewNotification = async (payload) => {
            const title = payload?.title || "New Notification";
            const body = payload?.message || payload?.body || "";
            
            // Play a standard Mixkit notification chime sound
            try {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                audio.play().catch(() => {});
            } catch (e) {
                // Ignore audio playback failure
            }

            // Surface native lock-screen / system notification banner via Service Worker
            // Never trigger from localhost so notifications strictly show the production domain
            const isLocal = typeof window !== 'undefined' && 
                (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            if (!isLocal && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                try {
                    const { showSystemNotification } = await import('@core/firebase/pushClient');
                    await showSystemNotification({
                        title,
                        body,
                        data: payload?.data || payload,
                    });
                } catch (err) {
                    console.warn('[push] SW local notification failed:', err);
                }
            }
        };

        let offNotification = null;
        import('@core/services/orderSocket')
            .then(({ onNotificationNew }) => {
                const getToken = () => token;
                offNotification = onNotificationNew(getToken, handleNewNotification);
            })
            .catch((err) => {
                console.warn('[push] Failed to register socket notification listener:', err);
            });

        return () => {
            if (offNotification) {
                offNotification();
            }
            const gestureEvents = ["pointerdown", "touchstart", "click", "keydown"];
            gestureEvents.forEach(event => {
                document.removeEventListener(event, handleGesture);
            });
        };
    }, [token]);

    const login = (userData) => {
        const rawRole = userData.role?.toLowerCase() || 'customer';
        const isAdminPortal = rawRole === 'admin' || rawRole === 'product';
        const role = isAdminPortal ? 'admin' : rawRole;
        const storageKey = ROLE_STORAGE_KEYS[role] || ROLE_STORAGE_KEYS[rawRole];

        if (storageKey && userData.token) {
            // Persist raw JWT string under auth storage key
            rawSet(storageKey, userData.token);

            rawRemove(STORAGE_KEYS.CART);
            rawRemove(STORAGE_KEYS.WISHLIST);

            setAuthData(prev => ({
                ...prev,
                admin: isAdminPortal ? userData.token : prev.admin,
                [rawRole]: userData.token
            }));
            setUser(userData); // Set full data initially

            // Clear any stale FCM session-registration marker so the fresh
            // login always triggers a real /push/register call, even if the
            // user logged in before during the same browser session.
            rawRemove(`push:registered:${role}`, { storage: 'session' });

            // Trigger FCM token registration immediately with the correct resolved role.
            // This avoids the activeRoleStore propagation delay that caused the
            // /push/register API to be skipped on the live platform.
            triggerFcmRegistration(role);
        } else {
            console.error('Invalid role or missing token for login:', rawRole);
        }
    };

    const logout = async () => {
        const storageKey = ROLE_STORAGE_KEYS[currentRole];
        const previousUserId = user?._id || user?.id || '';

        try {
            const { removeStoredFcmToken } = await import('@core/firebase/pushClient');
            await removeStoredFcmToken({ role: currentRole });
        } catch (error) {
            console.warn('Failed to remove push token during logout:', error);
        }

        if (storageKey) {
            rawRemove(storageKey);
        }

        // Remove the legacy shared token only when it belongs to the current role session.
        if (token && rawGet(LEGACY_TOKEN_KEY) === token) {
            rawRemove(LEGACY_TOKEN_KEY);
        }

        // Centralized sensitive-data cleanup: push tokens, recipient PII,
        // recent searches, support-unread counts, guest cart/wishlist and (for
        // delivery role) the rider's last-known GPS.
        clearOnLogout({
            role: currentRole,
            userId: previousUserId,
        });

        setAuthData((prev) => ({
            ...prev,
            [currentRole]: null,
        }));

        // Clear the current user profile from memory
        setUser(null);

        // Final fallback: redirect based on current path if needed
        // (ProtectedRoute usually handles this, but explicit navigation is safer for some UI edge cases)
        const path = window.location.pathname;
        if (path.startsWith('/admin')) window.location.href = '/admin/auth';
        else if (path.startsWith('/seller')) window.location.href = '/seller/auth';
        else if (path.startsWith('/delivery')) window.location.href = '/delivery/auth';
        else window.location.href = '/login';
    };

    const refreshUser = async () => {
        if (token) {
            try {
                const endpoint = `/${currentRole}/profile`;
                const response = await axiosInstance.get(endpoint);
                setUser(response.data.result);
                return response.data.result;
            } catch (error) {
                console.error('Failed to refresh profile:', error);
            }
        }
    };

    const value = useMemo(() => ({
        user,
        setUser,
        token,
        role: currentRole,
        isAuthenticated,
        isLoading,
        authData,
        login,
        logout,
        refreshUser
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [user, token, currentRole, isAuthenticated, isLoading, authData]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
