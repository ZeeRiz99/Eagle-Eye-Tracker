import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth, requireRole, requireSameFamilyGroup } from '../middleware/auth';
import { notificationFallbackService } from '../services/notificationFallbackService';
import { createGeofenceAlert } from '../services/geofenceService';

export const alertRouter = Router();

const ACK_TIMEOUT_PRIMARY_MS = 10_000;
const ACK_TIMEOUT_SECONDARY_MS = 30_000;

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

async function isAcknowledged(alertId: string): Promise<boolean> {
  const result = await pool.query('SELECT 1 FROM alert_acknowledgements WHERE alert_id = $1 LIMIT 1', [alertId]);
  return Boolean(result.rowCount);
}

async function scheduleEscalation(alertId: string, type: 'sos' | 'crash', studentName: string, latitude: number, longitude: number, familyGroupId: string) {
  const context = { alertId, type, studentName, latitude, longitude };

  setTimeout(async () => {
    if (await isAcknowledged(alertId)) return;
    const parents = await getFamilyParents(familyGroupId);
    const primary = parents[0];
    if (primary) await notificationFallbackService.escalateToVoiceCall(primary, context);

    setTimeout(async () => {
      if (await isAcknowledged(alertId)) return;
      const secondary = parents[1];
      if (secondary) await notificationFallbackService.escalateToVoiceCall(secondary, context);
    }, ACK_TIMEOUT_SECONDARY_MS);
  }, ACK_TIMEOUT_PRIMARY_MS);
}

const sosSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  audioUrl: z.string().url().optional(), // populated only if audio_recording consent is active
});

async function createAlert(
  type: 'sos' | 'crash',
  studentId: string,
  familyGroupId: string,
  latitude: number,
  longitude: number,
  opts: { speedMps?: number; audioUrl?: string } = {}
) {
  const audioExpiresAt = opts.audioUrl ? new Date(Date.now() + 72 * 60 * 60 * 1000) : null;
  const result = await pool.query(
    `INSERT INTO alerts (type, student_id, family_group_id, location, speed_mps, audio_url, audio_expires_at)
     VALUES ($1, $2, $3, ST_MakePoint($4, $5)::geography, $6, $7, $8)
     RETURNING id, type, status, created_at`,
    [type, studentId, familyGroupId, longitude, latitude, opts.speedMps ?? null, opts.audioUrl ?? null, audioExpiresAt]
  );
  return result.rows[0];
}

alertRouter.post('/sos', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = sosSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (!req.user!.familyGroupId) {
    return res.status(400).json({ error: 'Join a family group before sending alerts' });
  }
  const { latitude, longitude, audioUrl } = parsed.data;

  const studentResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.user!.sub]);
  const alert = await createAlert('sos', req.user!.sub, req.user!.familyGroupId, latitude, longitude, { audioUrl });

  const parents = await getFamilyParents(req.user!.familyGroupId);
  await notificationFallbackService.notifyParents(parents, {
    alertId: alert.id,
    type: 'sos',
    studentName: studentResult.rows[0]?.name ?? 'Student',
    latitude,
    longitude,
  });
  await scheduleEscalation(alert.id, 'sos', studentResult.rows[0]?.name ?? 'Student', latitude, longitude, req.user!.familyGroupId);

  return res.status(201).json(alert);
});

const crashSchema = sosSchema.extend({
  speedMps: z.number().min(0),
});

alertRouter.post('/crash', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = crashSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (!req.user!.familyGroupId) {
    return res.status(400).json({ error: 'Join a family group before sending alerts' });
  }
  const { latitude, longitude, audioUrl, speedMps } = parsed.data;

  const studentResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.user!.sub]);
  const alert = await createAlert('crash', req.user!.sub, req.user!.familyGroupId, latitude, longitude, {
    speedMps,
    audioUrl,
  });

  const parents = await getFamilyParents(req.user!.familyGroupId);
  await notificationFallbackService.notifyParents(parents, {
    alertId: alert.id,
    type: 'crash',
    studentName: studentResult.rows[0]?.name ?? 'Student',
    latitude,
    longitude,
  });
  await scheduleEscalation(alert.id, 'crash', studentResult.rows[0]?.name ?? 'Student', latitude, longitude, req.user!.familyGroupId);

  return res.status(201).json(alert);
});

const geofenceSchema = z.object({
  studentId: z.string().uuid(),
  familyGroupId: z.string().uuid(),
  zoneId: z.string().uuid(),
  direction: z.enum(['enter', 'exit']),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// System-triggered (called by the geofence evaluation job, not directly by the mobile client).
// Push-only per spec: no WhatsApp/voice escalation for geofence or low-battery alerts.
alertRouter.post('/geofence', requireAuth, async (req, res) => {
  const parsed = geofenceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { studentId, familyGroupId, direction, latitude, longitude } = parsed.data;

  const alert = await createGeofenceAlert({ studentId, familyGroupId, zoneId: parsed.data.zoneId, direction, latitude, longitude });

  return res.status(201).json(alert);
});

alertRouter.post('/:id/acknowledge', requireAuth, requireRole('parent'), async (req, res) => {
  const alertResult = await pool.query('SELECT family_group_id FROM alerts WHERE id = $1', [req.params.id]);
  if (!alertResult.rowCount || alertResult.rows[0].family_group_id !== req.user!.familyGroupId) {
    return res.status(403).json({ error: 'Not authorized for this alert' });
  }

  await pool.query(
    `INSERT INTO alert_acknowledgements (alert_id, parent_id)
     VALUES ($1, $2)
     ON CONFLICT (alert_id, parent_id) DO NOTHING`,
    [req.params.id, req.user!.sub]
  );
  await pool.query(`UPDATE alerts SET status = 'acknowledged' WHERE id = $1 AND status <> 'acknowledged'`, [
    req.params.id,
  ]);

  return res.json({ ok: true });
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

alertRouter.get(
  '/history/:familyGroupId',
  requireAuth,
  requireSameFamilyGroup('familyGroupId'),
  async (req, res) => {
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { page, pageSize } = parsed.data;
    const offset = (page - 1) * pageSize;

    const result = await pool.query(
      `SELECT id, type, student_id, status, speed_mps,
              ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
              created_at
       FROM alerts WHERE family_group_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.familyGroupId, pageSize, offset]
    );

    return res.json({ page, pageSize, items: result.rows });
  }
);
