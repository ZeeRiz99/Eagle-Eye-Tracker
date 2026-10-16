import { pool } from '../db/pool';
import { notificationFallbackService } from './notificationFallbackService';

interface GeofenceAlertInput {
  studentId: string;
  familyGroupId: string;
  zoneId: string;
  direction: 'enter' | 'exit';
  latitude: number;
  longitude: number;
}

// Shared by the internal geofence worker and the (auth-protected) API route.
// Push-only per spec §2a: geofence alerts never escalate to WhatsApp/voice.
export async function createGeofenceAlert(input: GeofenceAlertInput) {
  const alertType = input.direction === 'enter' ? 'geofence_enter' : 'geofence_exit';

  const result = await pool.query(
    `INSERT INTO alerts (type, student_id, family_group_id, location)
     VALUES ($1, $2, $3, ST_MakePoint($4, $5)::geography)
     RETURNING id, type, status, created_at`,
    [alertType, input.studentId, input.familyGroupId, input.longitude, input.latitude]
  );
  const alert = result.rows[0];

  const parents = await getFamilyParents(input.familyGroupId);
  await notificationFallbackService.notifyParents(parents, {
    alertId: alert.id,
    type: 'sos', // reuse push path; geofence never escalates
    studentName: '',
    latitude: input.latitude,
    longitude: input.longitude,
  });

  return alert;
}

async function getFamilyParents(familyGroupId: string) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.phone_number, u.phone_verified_at,
            array_remove(array_agg(d.fcm_token), NULL) AS fcm_tokens
     FROM users u
     LEFT JOIN devices d ON d.user_id = u.id
     WHERE u.family_group_id = $1 AND u.role = 'parent'
     GROUP BY u.id
     ORDER BY u.created_at`,
    [familyGroupId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    phoneNumber: row.phone_number,
    phoneVerified: Boolean(row.phone_verified_at),
    fcmTokens: row.fcm_tokens ?? [],
  }));
}
