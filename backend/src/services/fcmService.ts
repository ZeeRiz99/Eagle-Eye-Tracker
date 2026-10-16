import { cert, initializeApp, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '../config/env';

// Initialized lazily so the server can boot with FCM unconfigured; every call
// guards on env presence and no-ops (with a warn) when the project isn't set up.
function messaging() {
  if (!env.fcm.projectId || !env.fcm.clientEmail || !env.fcm.privateKey) {
    return null;
  }
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: env.fcm.projectId,
        clientEmail: env.fcm.clientEmail,
        privateKey: env.fcm.privateKey,
      }),
    });
  }
  return getMessaging();
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  priority?: 'high' | 'normal';
}

export async function sendPushToTokens(tokens: string[], payload: PushPayload): Promise<void> {
  const m = messaging();
  if (!m) {
    console.warn('[fcm] FCM not configured, skipping push');
    return;
  }
  if (!tokens.length) return;

  const results = await m.sendEachForMulticast({
    tokens,
    notification: { title: payload.title, body: payload.body },
    data: payload.data,
    android: { priority: payload.priority === 'high' ? 'high' : 'normal' },
    apns: payload.priority === 'high' ? { headers: { 'apns-priority': '10' } } : undefined,
  });

  // Prune tokens that are permanently invalid (unregistered/removed) so they
  // don't keep failing on future alerts.
  const invalidTokens = tokens.filter((_, i) => {
    const err = results.responses[i]?.error;
    return err?.code === 'messaging/registration-token-not-registered';
  });
  if (invalidTokens.length) {
    await deleteTokens(invalidTokens);
  }
}

async function deleteTokens(tokens: string[]): Promise<void> {
  const { pool } = await import('../db/pool');
  await pool.query('DELETE FROM devices WHERE fcm_token = ANY($1::text[])', [tokens]);
}
