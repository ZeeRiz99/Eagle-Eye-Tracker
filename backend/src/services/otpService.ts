import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';

const OTP_TTL_MS = 5 * 60 * 1000;

export function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function createOtp(userId: string, phoneNumber: string): Promise<string> {
  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await pool.query(
    `INSERT INTO phone_otps (user_id, phone_number, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, phoneNumber, codeHash, expiresAt]
  );

  // TODO: wire to actual SMS/voice OTP delivery provider once contracted (see spec §8).
  return code;
}

export async function verifyOtp(userId: string, phoneNumber: string, code: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT id, code_hash FROM phone_otps
     WHERE user_id = $1 AND phone_number = $2 AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [userId, phoneNumber]
  );
  const otp = result.rows[0];
  if (!otp) return false;

  const matches = await bcrypt.compare(code, otp.code_hash);
  if (!matches) return false;

  await pool.query('UPDATE phone_otps SET consumed_at = now() WHERE id = $1', [otp.id]);
  await pool.query('UPDATE users SET phone_number = $1, phone_verified_at = now() WHERE id = $2', [
    phoneNumber,
    userId,
  ]);
  return true;
}
