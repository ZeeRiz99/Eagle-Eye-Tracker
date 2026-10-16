import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { createOtp, verifyOtp } from '../services/otpService';

export const phoneRouter = Router();

const verifySchema = z.object({ phoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Use E.164 format, e.g. +923001234567') });

// Sends an OTP to the given number. Required before it can be trusted as a voice-call
// escalation target (see spec §2a) — an unverified number is never called.
phoneRouter.post('/verify', requireAuth, async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const code = await createOtp(req.user!.sub, parsed.data.phoneNumber);
  const response: Record<string, unknown> = { ok: true };
  if (process.env.NODE_ENV !== 'production') {
    response.devOtpCode = code; // only surfaced outside production for local testing
  }
  return res.status(202).json(response);
});

const confirmSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/),
  code: z.string().length(6),
});

phoneRouter.post('/confirm', requireAuth, async (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const verified = await verifyOtp(req.user!.sub, parsed.data.phoneNumber, parsed.data.code);
  if (!verified) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }
  return res.json({ ok: true });
});
