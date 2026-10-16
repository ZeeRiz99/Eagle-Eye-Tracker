import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';

export const devicesRouter = Router();

const registerDeviceSchema = z.object({
  fcmToken: z.string().min(1),
  platform: z.enum(['android', 'ios', 'watch']),
});

devicesRouter.post('/register', requireAuth, async (req, res) => {
  const parsed = registerDeviceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { fcmToken, platform } = parsed.data;

  await pool.query(
    `INSERT INTO devices (user_id, fcm_token, platform, last_seen_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, fcm_token)
     DO UPDATE SET platform = EXCLUDED.platform, last_seen_at = now()`,
    [req.user!.sub, fcmToken, platform]
  );

  return res.status(201).json({ ok: true });
});
