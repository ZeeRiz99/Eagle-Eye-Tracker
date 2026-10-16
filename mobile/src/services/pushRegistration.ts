import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiFetch } from '../api/client';

// Registers this device's native push token (FCM on Android, APNs on iOS) with the
// backend /devices/register endpoint, so the backend's firebase-admin FCM sends
// (src/services/fcmService.ts) have a real target. Uses the native device token,
// not the Expo push token, since the backend pushes through FCM directly.
export async function registerForPushNotifications(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let status = existingStatus;
    if (existingStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') {
      console.warn('[push] notification permission not granted');
      return false;
    }

    const token = await Notifications.getDevicePushTokenAsync();
    const tokenValue = typeof token.data === 'string' ? token.data : String(token.data);

    await apiFetch('/devices/register', {
      method: 'POST',
      body: { fcmToken: tokenValue, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });

    return true;
  } catch (err) {
    console.warn('[push] registration failed', err);
    return false;
  }
}
