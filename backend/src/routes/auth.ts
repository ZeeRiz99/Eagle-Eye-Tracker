import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['parent', 'student']),
  dateOfBirth: z.string().optional(),
});

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, email, password, role, dateOfBirth } = parsed.data;

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, date_of_birth)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role, family_group_id`,
    [name, email, passwordHash, role, dateOfBirth ?? null]
  );
  const user = result.rows[0];

  const accessToken = signAccessToken({ sub: user.id, role: user.role, familyGroupId: user.family_group_id });
  const refreshToken = signRefreshToken({ sub: user.id });

  return res.status(201).json({ user, accessToken, refreshToken });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const result = await pool.query(
    'SELECT id, name, email, password_hash, role, family_group_id FROM users WHERE email = $1',
    [email]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role, familyGroupId: user.family_group_id });
  const refreshToken = signRefreshToken({ sub: user.id });

  return res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, familyGroupId: user.family_group_id },
    accessToken,
    refreshToken,
  });
});

const refreshSchema = z.object({ refreshToken: z.string() });

authRouter.post('/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const { sub } = verifyRefreshToken(parsed.data.refreshToken);
    const result = await pool.query('SELECT id, role, family_group_id FROM users WHERE id = $1', [sub]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    const accessToken = signAccessToken({ sub: user.id, role: user.role, familyGroupId: user.family_group_id });
    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});
