import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';

export const userRouter = Router();

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  discreetModeEnabled: z.boolean().optional(),
});

userRouter.put('/profile', requireAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, discreetModeEnabled } = parsed.data;

  const setClauses: string[] = [];
  const values: (string | boolean)[] = [];
  if (name !== undefined) {
    values.push(name);
    setClauses.push(`name = $${values.length}`);
  }
  if (discreetModeEnabled !== undefined) {
    values.push(discreetModeEnabled);
    setClauses.push(`discreet_mode_enabled = $${values.length}`);
  }
  if (!setClauses.length) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  values.push(req.user!.sub);

  const result = await pool.query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length}
     RETURNING id, name, email, discreet_mode_enabled`,
    values
  );
  return res.json(result.rows[0]);
});

// School details (name + timings) live on the user record so both the student
// and every parent in the family can see the same information (spec §3).
const schoolSchema = z.object({
  schoolName: z.string().min(1).max(120),
  schoolStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  schoolEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

userRouter.put('/school', requireAuth, async (req, res) => {
  const parsed = schoolSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { schoolName, schoolStartTime, schoolEndTime } = parsed.data;

  const result = await pool.query(
    `UPDATE users
     SET school_name = $1,
         school_start_time = $2::time,
         school_end_time = $3::time
     WHERE id = $4
     RETURNING id, school_name, school_start_time, school_end_time`,
    [schoolName, schoolStartTime ?? null, schoolEndTime ?? null, req.user!.sub]
  );
  return res.json(result.rows[0]);
});

// Actual upload handling (S3/Cloudinary) is wired once storage credentials are provisioned;
// this accepts a pre-uploaded URL from a client-side direct upload flow.
const pictureSchema = z.object({ profilePictureUrl: z.string().url() });

userRouter.post('/upload-picture', requireAuth, async (req, res) => {
  const parsed = pictureSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await pool.query(
    `UPDATE users SET profile_picture_url = $1 WHERE id = $2 RETURNING id, profile_picture_url`,
    [parsed.data.profilePictureUrl, req.user!.sub]
  );
  return res.json(result.rows[0]);
});

// Right-to-erasure endpoint required for PDPB/data-protection compliance (spec §5).
userRouter.delete('/:id/data', requireAuth, async (req, res) => {
  if (req.user!.sub !== req.params.id) {
    return res.status(403).json({ error: 'Can only delete your own account data' });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  return res.status(204).send();
});
