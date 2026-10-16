import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';

export interface EmergencyNotificationData {
  alertId?: string;
  type?: string;
  studentName?: string;
  latitude?: string;
  longitude?: string;
}

// Extracts the emergency data from a notification response. The backend pushes
// (src/services/fcmService.ts) send these fields in the data payload for SOS/Crash.
export function extractEmergencyData(response: Notifications.NotificationResponse | null): EmergencyNotificationData | null {
  if (!response) return null;
  const data = response.notification.request.content.data ?? {};
  if (!data.alertId || !data.latitude || !data.longitude) return null;
  return {
    alertId: data.alertId as string,
    type: data.type as string | undefined,
    studentName: data.studentName as string | undefined,
    latitude: data.latitude as string,
    longitude: data.longitude as string,
  };
}

// Handles a tap on a push notification: if it's an emergency alert, the parent
// should see the full-screen popup immediately (spec §6).
export function useNotificationTapHandler(onEmergency: (data: EmergencyNotificationData) => void) {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = extractEmergencyData(response);
      if (data) onEmergency(data);
    });
    return () => subscription.remove();
  }, [onEmergency]);
}
