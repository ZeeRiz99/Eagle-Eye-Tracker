import { env } from '../config/env';
import { pool } from '../db/pool';
import { sendPushToTokens } from './fcmService';

interface ParentTarget {
  id: string;
  name: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
  fcmTokens: string[];
}

interface AlertContext {
  alertId: string;
  type: 'sos' | 'crash';
  studentName: string;
  latitude: number;
  longitude: number;
}

// Escalation ladder per spec §6:
//   push (FCM) + WhatsApp template fire in parallel
//   -> if no ACK in ~10s: voice call to primary verified parent
//   -> if no ACK in ~30s more: voice call to secondary parent/guardian
// Reserved for SOS/Crash only — never geofence/low-battery, per the narrow voice-call
// consent scope in spec §2a.
export class NotificationFallbackService {
  async notifyParents(parents: ParentTarget[], context: AlertContext): Promise<void> {
    await Promise.all([this.sendPush(parents, context), this.sendWhatsApp(parents, context)]);
  }

  async escalateToVoiceCall(parent: ParentTarget, context: AlertContext): Promise<void> {
    if (!parent.phoneVerified || !parent.phoneNumber) {
      return; // unverified/missing number: leg is skipped, per consent model
    }
    if (!env.voice.accountSid || !env.voice.authToken) {
      console.warn('[notificationFallback] voice provider not configured, skipping call escalation');
      return;
    }

    // TODO: call the contracted telephony provider's Voice API (e.g. Twilio Voice) here with a
    // fixed, non-promotional TTS script: "Emergency alert for {studentName}. Please open the
    // Eagle Eye Tracker app immediately." Never include marketing/links per spec §2a.
    console.info(`[notificationFallback] would place voice call to ${parent.phoneNumber} for alert ${context.alertId}`);

    await pool.query(`UPDATE alerts SET status = 'escalated_call' WHERE id = $1`, [context.alertId]);
  }

  private async sendPush(parents: ParentTarget[], context: AlertContext): Promise<void> {
    const tokens = parents.flatMap((p) => p.fcmTokens);
    if (!tokens.length) {
      console.warn('[notificationFallback] no registered device tokens, skipping push');
      return;
    }

    await sendPushToTokens(tokens, {
      title: context.type === 'sos' ? '🚨 SOS Alert' : '🚨 Crash Alert',
      body: `${context.studentName} has triggered an emergency alert. Check the app now.`,
      data: {
        alertId: context.alertId,
        type: context.type,
        studentName: context.studentName,
        latitude: String(context.latitude),
        longitude: String(context.longitude),
      },
      priority: 'high',
    });

    await pool.query(`UPDATE alerts SET status = 'delivered' WHERE id = $1`, [context.alertId]);
  }

  private async sendWhatsApp(parents: ParentTarget[], context: AlertContext): Promise<void> {
    const numbers = parents.filter((p) => p.phoneVerified && p.phoneNumber).map((p) => p.phoneNumber);
    if (!numbers.length || !env.whatsapp.apiUrl) {
      console.warn('[notificationFallback] WhatsApp not configured or no verified numbers, skipping');
      return;
    }
    // TODO: call the WhatsApp Business API (via BSP) using env.whatsapp.sosTemplateName,
    // populating {{name}} and {{location_link}} per the pre-approved template.
    console.info(`[notificationFallback] would send WhatsApp template to ${numbers.length} parent(s)`);

    await pool.query(`UPDATE alerts SET status = 'escalated_whatsapp' WHERE id = $1`, [context.alertId]);
  }
}

export const notificationFallbackService = new NotificationFallbackService();
