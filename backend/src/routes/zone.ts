import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth, requireRole, requireSameFamilyGroup } from '../middleware/auth';

export const zoneRouter = Router();

const createZoneSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusM: z.number().int().min(10).max(10000),
  activeFrom: z.string().optional(),
  activeTo: z.string().optional(),
});

zoneRouter.post('/', requireAuth, requireRole('parent'), async (req, res) => {
  const parsed = createZoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (!req.user!.familyGroupId) {
    return res.status(400).json({ error: 'Join or create a family group first' });
  }
  const { name, latitude, longitude, radiusM, activeFrom, activeTo } = parsed.data;

  const result = await pool.query(
    `INSERT INTO safe_zones (family_group_id, name, center, radius_m, active_from, active_to)
     VALUES ($1, $2, ST_MakePoint($3, $4)::geography, $5, $6, $7)
     RETURNING id, name, radius_m, active_from, active_to, is_active`,
    [req.user!.familyGroupId, name, longitude, latitude, radiusM, activeFrom ?? null, activeTo ?? null]
  );

  return res.status(201).json(result.rows[0]);
});

zoneRouter.get('/:familyGroupId', requireAuth, requireSameFamilyGroup('familyGroupId'), async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, ST_Y(center::geometry) AS latitude, ST_X(center::geometry) AS longitude,
            radius_m, active_from, active_to, is_active
     FROM safe_zones WHERE family_group_id = $1 ORDER BY created_at`,
    [req.params.familyGroupId]
  );
  return res.json(result.rows);
});

const patchZoneSchema = z.object({
  name: z.string().min(1).optional(),
  radiusM: z.number().int().min(10).max(10000).optional(),
  activeFrom: z.string().nullable().optional(),
  activeTo: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

zoneRouter.patch('/:id', requireAuth, requireRole('parent'), async (req, res) => {
  const parsed = patchZoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const owned = await pool.query('SELECT family_group_id FROM safe_zones WHERE id = $1', [req.params.id]);
  if (!owned.rowCount || owned.rows[0].family_group_id !== req.user!.familyGroupId) {
    return res.status(403).json({ error: 'Not authorized for this safe zone' });
  }

  const fields = parsed.data;
  const setClauses: string[] = [];
  const values: (string | number | boolean | null)[] = [];
  const columnMap: Array<{ field: keyof typeof fields; column: string }> = [
    { field: 'name', column: 'name' },
    { field: 'radiusM', column: 'radius_m' },
    { field: 'activeFrom', column: 'active_from' },
    { field: 'activeTo', column: 'active_to' },
    { field: 'isActive', column: 'is_active' },
  ];
  for (const { field, column } of columnMap) {
    const value = fields[field];
    if (value !== undefined) {
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    }
  }
  if (!setClauses.length) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  values.push(req.params.id);

  const result = await pool.query(
    `UPDATE safe_zones SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING id, name, radius_m, active_from, active_to, is_active`,
    values
  );
  return res.json(result.rows[0]);
});
