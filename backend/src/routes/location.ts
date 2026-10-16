import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';

export const locationRouter = Router();

const historyQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// Family-scoped: only a family member of the target user may read their location history.
locationRouter.get('/history/:userId', requireAuth, async (req, res) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { from, to, page, pageSize } = parsed.data;

  const target = await pool.query('SELECT family_group_id FROM users WHERE id = $1', [req.params.userId]);
  if (!target.rowCount || target.rows[0].family_group_id !== req.user!.familyGroupId) {
    return res.status(403).json({ error: 'Not authorized for this user\'s location history' });
  }

  const conditions = ['user_id = $1'];
  const values: (string | number)[] = [req.params.userId];
  if (from) {
    values.push(from);
    conditions.push(`recorded_at >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    conditions.push(`recorded_at <= $${values.length}`);
  }

  const offset = (page - 1) * pageSize;
  values.push(pageSize, offset);

  const result = await pool.query(
    `SELECT id, ST_Y(geom::geometry) AS latitude, ST_X(geom::geometry) AS longitude,
            speed_mps, accuracy_m, battery_pct, recorded_at
     FROM locations
     WHERE ${conditions.join(' AND ')}
     ORDER BY recorded_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return res.json({ page, pageSize, items: result.rows });
});
