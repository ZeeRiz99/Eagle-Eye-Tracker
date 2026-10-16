import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';

export const consentRouter = Router();

const consentSchema = z.object({
  consentType: z.enum(['audio_recording', 'location_sharing', 'voice_call_alert', 'tos']),
  granted: z.boolean(),
  appVersion: z.string().optional(),
});

// consent_logs is append-only by design: every grant/revoke is a new row, never an update.
// This is the legal defensibility record referenced in the revised spec — do not mutate past entries.
consentRouter.post('/', requireAuth, async (req, res) => {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { consentType, granted, appVersion } = parsed.data;

  const result = await pool.query(
    `INSERT INTO consent_logs (user_id, consent_type, granted, app_version, ip_address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, consent_type, granted, created_at`,
    [req.user!.sub, consentType, granted, appVersion ?? null, req.ip]
  );

  return res.status(201).json(result.rows[0]);
});
