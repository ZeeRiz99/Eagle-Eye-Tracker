import { pool } from '../db/pool';
import { createGeofenceAlert } from '../services/geofenceService';

// Geofence evaluation per spec §3/§6. Runs on a schedule and checks the latest
// location of every student against their family's active safe zones. Entry/exit
// transitions are tracked in-memory (last state per student-zone pair) so we only
// alert on a real change — not on every poll. Push-only per spec §2a.

interface SafeZone {
  id: string;
  familyGroupId: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  activeFrom: string | null;
  activeTo: string | null;
}

const transitionState = new Map<string, 'inside' | 'outside'>();
const POLL_INTERVAL_MS = 60_000; // 1 minute

function zoneKey(studentId: string, zoneId: string): string {
  return `${studentId}:${zoneId}`;
}

function isZoneActive(zone: SafeZone): boolean {
  if (!zone.activeFrom || !zone.activeTo) return true;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [fromH, fromM] = zone.activeFrom.split(':').map(Number);
  const [toH, toM] = zone.activeTo.split(':').map(Number);
  const fromMinutes = fromH * 60 + fromM;
  const toMinutes = toH * 60 + toM;
  if (fromMinutes <= toMinutes) return current >= fromMinutes && current <= toMinutes;
  // Overnight window (e.g. 22:00–06:00)
  return current >= fromMinutes || current <= toMinutes;
}

async function getStudentsWithLatestLocation() {
  const result = await pool.query(
    `SELECT DISTINCT ON (u.id)
            u.id AS student_id, u.family_group_id,
            ST_Y(l.geom::geometry) AS latitude, ST_X(l.geom::geometry) AS longitude
     FROM users u
     JOIN locations l ON l.user_id = u.id
     WHERE u.role = 'student'
     ORDER BY u.id, l.recorded_at DESC`
  );
  return result.rows;
}

async function getSafeZones(familyGroupId: string): Promise<SafeZone[]> {
  const result = await pool.query(
    `SELECT id, family_group_id, name,
            ST_Y(center::geometry) AS latitude, ST_X(center::geometry) AS longitude,
            radius_m, active_from, active_to
     FROM safe_zones WHERE family_group_id = $1 AND is_active = true`,
    [familyGroupId]
  );
  return result.rows;
}

export async function evaluateGeofences(): Promise<void> {
  const students = await getStudentsWithLatestLocation();
  for (const student of students) {
    if (!student.family_group_id) continue;

    const zones = await getSafeZones(student.family_group_id);
    for (const zone of zones) {
      if (!isZoneActive(zone)) {
        transitionState.set(zoneKey(student.student_id, zone.id), 'outside');
        continue;
      }

      // ST_DWithin on geography does the great-circle distance check directly in SQL.
      const distanceResult = await pool.query(
        `SELECT ST_DWithin(
           ST_MakePoint($1, $2)::geography,
           ST_MakePoint($3, $4)::geography,
           $5
         ) AS inside`,
        [student.longitude, student.latitude, zone.longitude, zone.latitude, zone.radiusM]
      );
      const inside = distanceResult.rows[0].inside;
      const key = zoneKey(student.student_id, zone.id);
      const previous = transitionState.get(key) ?? 'outside'; // default: outside so first fix inside = entry

      if (inside && previous !== 'inside') {
        transitionState.set(key, 'inside');
        await createGeofenceAlert({
          studentId: student.student_id,
          familyGroupId: student.family_group_id,
          zoneId: zone.id,
          direction: 'enter',
          latitude: student.latitude,
          longitude: student.longitude,
        });
      } else if (!inside && previous !== 'outside') {
        transitionState.set(key, 'outside');
        await createGeofenceAlert({
          studentId: student.student_id,
          familyGroupId: student.family_group_id,
          zoneId: zone.id,
          direction: 'exit',
          latitude: student.latitude,
          longitude: student.longitude,
        });
      }
    }
  }
}

export function startGeofenceWorker(): void {
  setInterval(() => {
    evaluateGeofences().catch((err) => console.error('[geofence] evaluation failed', err));
  }, POLL_INTERVAL_MS);
  console.log(`[geofence] worker started (poll every ${POLL_INTERVAL_MS / 1000}s)`);
}
