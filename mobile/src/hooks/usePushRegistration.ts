import { useEffect } from 'react';
import { registerForPushNotifications } from '../services/pushRegistration';

// Registers the device push token with the backend once the user is authenticated.
// Token registration is idempotent on the backend (upsert on user+token), so calling
// this on every authenticated app start is safe and keeps tokens fresh.
export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const ok = await registerForPushNotifications();
      if (!ok && !cancelled) {
        // Permission may be granted later; re-attempt once on next app start.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
