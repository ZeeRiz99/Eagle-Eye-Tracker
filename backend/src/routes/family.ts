import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';
import { signAccessToken } from '../utils/jwt';

export const familyRouter = Router();

const INVITE_CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24h expiry, single-use

// Parent creates a family group (first-time) or generates a fresh invite code for an existing one.
familyRouter.post('/invite', requireAuth, requireRole('parent'), async (req, res) => {
  const inviteCode = crypto.randomBytes(4).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_CODE_TTL_MS);

  if (req.user!.familyGroupId) {
    const result = await pool.query(
      `UPDATE family_groups
       SET invite_code = $1, invite_code_expires_at = $2, invite_code_used = false
       WHERE id = $3
       RETURNING id, name, invite_code, invite_code_expires_at`,
      [inviteCode, expiresAt, req.user!.familyGroupId]
    );
    return res.json(result.rows[0]);
  }

  const nameSchema = z.object({ name: z.string().min(1).default('My Family') });
  const { name } = nameSchema.parse(req.body ?? {});

  const familyResult = await pool.query(
    `INSERT INTO family_groups (name, invite_code, invite_code_expires_at, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, invite_code, invite_code_expires_at`,
    [name, inviteCode, expiresAt, req.user!.sub]
  );
  const familyGroup = familyResult.rows[0];

  await pool.query('UPDATE users SET family_group_id = $1 WHERE id = $2', [familyGroup.id, req.user!.sub]);

  return res.status(201).json(familyGroup);
});

const joinSchema = z.object({ inviteCode: z.string().min(1) });

// Lists every member of the caller's family group so the parent app can show
// names, photos, and status for the people being tracked (spec §2/§3).
familyRouter.get('/members', requireAuth, async (req, res) => {
  if (!req.user!.familyGroupId) {
    return res.status(400).json({ error: 'Join a family group first' });
  }
  const result = await pool.query(
    `SELECT id, name, role, profile_picture_url, phone_number, school_name, school_start_time, school_end_time, created_at
     FROM users
     WHERE family_group_id = $1
     ORDER BY role, created_at`,
    [req.user!.familyGroupId]
  );
  return res.json(result.rows);
});

familyRouter.post('/join', requireAuth, async (req, res) => {
  const parsed = joinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const groupResult = await client.query(
      `SELECT id, invite_code_expires_at, invite_code_used FROM family_groups
       WHERE invite_code = $1 FOR UPDATE`,
      [parsed.data.inviteCode]
    );
    const group = groupResult.rows[0];
    if (!group) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invalid invite code' });
    }
    if (group.invite_code_used || new Date(group.invite_code_expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'Invite code expired or already used' });
    }

    await client.query('UPDATE family_groups SET invite_code_used = true WHERE id = $1', [group.id]);
    await client.query('UPDATE users SET family_group_id = $1 WHERE id = $2', [group.id, req.user!.sub]);

    await client.query('COMMIT');

    const accessToken = signAccessToken({ sub: req.user!.sub, role: req.user!.role, familyGroupId: group.id });
    return res.json({ familyGroupId: group.id, accessToken });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
