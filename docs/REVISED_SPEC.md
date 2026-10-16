# Eagle Eye Tracker — Revised Spec (Pakistan / Karachi Market)

## 1. Legal Context (Pakistan) — Why This Revision Matters

| Law / Ruling | Relevance | Design Impact |
|---|---|---|
| **Supreme Court ruling, Mar 2026 (PLJ 2026 SC 114)** | Recording a private conversation **without consent of the person(s) involved** is illegal, especially where used against someone. | Audio capture during SOS/Crash must be scoped narrowly (ambient safety evidence, not conversation surveillance), disclosed in ToS, and only enabled if the **account holder explicitly opts in**. See §3. |
| **PECA 2016, Section 19** | Unauthorized interception of transmissions — up to 2 years imprisonment / Rs. 500,000 fine. | We are not intercepting third-party transmissions (it's the device owner's own mic on their own device), but we must be able to prove **explicit, revocable, logged consent** if ever challenged. |
| **PECA (Amendment) Act 2025** | New offences + new regulator; enforcement is tightening, not loosening. | Build a **ConsentLog** (immutable, timestamped) from day one — cheap now, expensive to retrofit later. |
| **Personal Data Protection Bill (PDPB) 2023, Section 31(2)** — not yet law, but the clear policy direction | "Critical personal data" (this includes minors' data, precise location, biometric/health-adjacent data) must be processed on servers **located in Pakistan**. | We don't have to comply with a bill that isn't law yet, but designing for **data residency flexibility** now avoids a costly re-platform later. See §5. |
| **No public API for Rescue 1122 / Sindh Emergency Rescue Service (SERS)** | Unlike US RapidSOS, there's no programmatic dispatch integration available in Sindh/Karachi. | "Call Emergency" in the parent app must be a real **`tel:1122`** phone call trigger, not a silent API dispatch. Don't overpromise this in marketing copy. |
| **SMS excluded (product decision)** | SMS fallback dropped in favor of a no-data-required channel with less carrier/aggregator dependency. | Replaced with an **automated outbound voice call (PSTN/IVR)** as the no-signal-independent fallback, plus **WhatsApp Business API** as a parallel data-based channel. See §6. |
| **PTA anti-nuisance-call rules / general robocall exposure** | Automated outbound calls to a phone number require the recipient's own explicit consent, scoped narrowly, or they risk being treated as unsolicited/nuisance calls. | Voice-call escalation is opt-in per parent number, logged in `consent_logs`, and restricted to SOS/Crash only — never marketing, reminders, or geofence/battery alerts. See §2a. |

**Bottom line:** nothing here blocks the build, but it reshapes three things — the consent flow for audio, where data physically lives, and how the "emergency call" feature actually behaves.

---

## 2. Consent Model (Revised)

Audio is the highest-risk feature legally. Revised rule: **audio capture is OFF by default, per-child opt-in, and only ever triggered by the two conscious-action flows (SOS, Crash-confirmed) — never passive/continuous.**

Flow:
1. At family-group setup, the **parent/guardian** (as the consenting adult on behalf of a minor) and the **student** (if old enough to have their own account) both see an explicit, plain-language consent screen: *"During an SOS or crash alert, this app will record up to 30 seconds of audio from your surroundings and send it to your linked parent. This is only for emergency verification."*
2. Consent choice is stored as an immutable **ConsentLog** record (who, what, when, app version, IP) — this is our legal defensibility artifact, not just a UI checkbox.
3. Consent is **revocable** any time from Settings; if revoked, SOS/Crash still fire (location + push) but audio capture is skipped.
4. **On-device notice is mandatory while recording** — a persistent visible indicator (status bar icon/banner) and, in non-Discreet mode, a short tone. This satisfies the "notice to persons present" principle courts have leaned on, and Discreet Mode is scoped only to *sound/vibration suppression*, not to hiding the recording indicator from the OS-level privacy indicators (iOS/Android already show a mic-in-use dot — don't try to suppress that, it's an OS integrity signal).
5. Audio retention default: **72 hours**, then hard-deleted by a scheduled purge job, unless a parent has explicitly saved/exported it during that window.

### 2a. Consent Model — Voice-Call Escalation (new)

Automated outbound calls are a separate consent scope from audio recording — this is *calling* a parent's number, not recording anything.

1. At family-group setup, each parent registers a phone number and explicitly consents: *"By joining this family group, you agree to receive automated emergency phone calls from Eagle Eye Tracker when your linked student triggers an SOS or crash alert."* Logged as `consent_type: 'voice_call_alert'` in `consent_logs`, tied to the **parent's own account**, not the student's.
2. The number is verified once via an OTP call/SMS at registration, so the system never trusts an unreachable or mistyped number as an escalation target.
3. Scope is narrow and non-negotiable: voice-call escalation fires **only** for SOS and confirmed Crash alerts — never for geofence, low-battery, or any marketing/reminder use, keeping it clearly outside robocall/nuisance-call territory.
4. Parents can update or remove their number anytime from Settings. If no verified number is on file, that escalation leg is simply skipped (push + WhatsApp still fire).
5. The TTS message content is fixed and non-promotional: *"Emergency alert for [child name]. Please open the Eagle Eye Tracker app immediately."* — no ads, no links, no upsell, to stay defensible under any future PTA nuisance-call scrutiny.

---

## 3. Architecture (Revised)

**Single primary datastore** instead of Postgres+Mongo: **PostgreSQL + PostGIS + TimescaleDB**. Handles relational data, geospatial queries (safe zone containment, nearest-zone lookups), and time-series location history in one engine — fewer moving parts, one backup/restore story, transactional consistency between alerts and users.

- **Cache/Realtime backplane:** Redis — Socket.io adapter for horizontal scaling, geofence-check caching, rate limiting on `/alert/*` endpoints.
- **Object storage:** S3-compatible (AWS S3 or a Pakistan-friendly S3-compatible provider) for profile pictures and the transient audio clips — encrypted at rest, short lifecycle policy on the audio bucket (auto-expire at 72h via bucket lifecycle rule).
- **Data residency:** because location + audio of minors likely falls under "critical personal data" once PDPB passes, isolate those two tables/buckets behind a repository interface (`LocationStore`, `AlertMediaStore`) so the physical region can be swapped to a Pakistan-based or nearest-compliant region (e.g., AWS `me-south-1` Bahrain, or a local Pakistani data-center/VPS provider) without touching application code. Don't over-engineer this now — just don't hardcode a region assumption into business logic.
- **Escalation fallback service:** new `NotificationFallbackService` — push (FCM) and a WhatsApp Business API template alert fire in parallel on SOS/Crash. If no parent ACK within ~10s, escalate to an **automated outbound TTS voice call** (via a telephony API, e.g. Twilio Voice or a local voice API) to the primary verified parent number; if still unacknowledged, call the secondary parent/guardian. Reserved for SOS/Crash only, not geofence/battery alerts, to control cost and respect the narrow voice-call consent scope (§2a).
- **Emergency dial integration:** `tel:1122` deep link from the parent-app emergency popup's "Call Emergency" button. No API dispatch exists for Sindh — don't build for one.

---

## 4. Revised Database Schema (single Postgres schema)

```sql
-- users
users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('parent','student')) NOT NULL,
  profile_picture_url TEXT,
  family_group_id UUID REFERENCES family_groups(id),
  date_of_birth DATE,              -- needed to flag minor accounts
  phone_number TEXT,                -- E.164 format, used for voice-call escalation + WhatsApp
  phone_verified_at TIMESTAMPTZ,    -- set after OTP verification; unverified numbers are never called
  discreet_mode_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- family_groups
family_groups (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  invite_code_expires_at TIMESTAMPTZ NOT NULL,   -- expiring, single-use codes
  invite_code_used BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- consent_logs  (immutable — legal defensibility record)
consent_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  consent_type TEXT CHECK (consent_type IN ('audio_recording','location_sharing','voice_call_alert','tos')) NOT NULL,
  granted BOOLEAN NOT NULL,
  app_version TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- devices  (push tokens, one per installed device/session)
devices (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  fcm_token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('android','ios','watch')),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- locations  (TimescaleDB hypertable, PostGIS geography column)
locations (
  id BIGSERIAL,
  user_id UUID REFERENCES users(id),
  geom GEOGRAPHY(POINT, 4326) NOT NULL,
  speed_mps NUMERIC,
  accuracy_m NUMERIC,
  battery_pct SMALLINT,
  recorded_at TIMESTAMPTZ NOT NULL
);
-- SELECT create_hypertable('locations', 'recorded_at');
-- retention policy: raw points purged after 30 days, downsampled hourly summary kept 1 year

-- safe_zones
safe_zones (
  id UUID PRIMARY KEY,
  family_group_id UUID REFERENCES family_groups(id),
  name TEXT NOT NULL,
  center GEOGRAPHY(POINT, 4326) NOT NULL,
  radius_m INTEGER NOT NULL,
  active_from TIME,          -- optional time window, e.g. School 08:00-15:00
  active_to TIME,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- alerts
alerts (
  id UUID PRIMARY KEY,
  type TEXT CHECK (type IN ('sos','crash','geofence_enter','geofence_exit','low_battery')) NOT NULL,
  student_id UUID REFERENCES users(id),
  family_group_id UUID REFERENCES family_groups(id),
  location GEOGRAPHY(POINT, 4326),
  speed_mps NUMERIC,                     -- populated for crash alerts
  audio_url TEXT,                        -- nullable; only if consent + not revoked
  audio_expires_at TIMESTAMPTZ,          -- 72h lifecycle marker
  status TEXT CHECK (status IN ('pending','delivered','acknowledged','escalated_whatsapp','escalated_call')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- alert_acknowledgements  (supports multi-parent families)
alert_acknowledgements (
  id UUID PRIMARY KEY,
  alert_id UUID REFERENCES alerts(id),
  parent_id UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  UNIQUE(alert_id, parent_id)
);
```

Key fixes vs. original spec:
- `Alert.parentId` (singular) removed — replaced with `family_group_id` + `alert_acknowledgements`, so multi-parent families each get their own ack state.
- `FamilyGroup` is now a real modeled entity (it was referenced but never defined).
- `devices` table added — FCM pushes are impossible without stored tokens.
- `consent_logs` added — this is the compliance backbone.
- Invite codes are expiring + single-use to stop strangers joining a family group.
- Safe zones support time windows and an active flag to cut geofence alert noise.

---

## 5. Revised API (v1, versioned)

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/family/invite                 (parent only, generates expiring code)
POST   /api/v1/family/join                    (consumes invite code, single-use)

POST   /api/v1/devices/register               (FCM token registration)

WS     /ws/location                            (live location stream, auth'd socket)
GET    /api/v1/location/history/:userId?from&to&page   (paginated, family-scoped auth)

POST   /api/v1/consent                         (log consent grant/revoke)
POST   /api/v1/user/phone/verify               (send OTP to parent phone)
POST   /api/v1/user/phone/confirm              (confirm OTP, sets phone_verified_at)

POST   /api/v1/alert/sos
POST   /api/v1/alert/crash
POST   /api/v1/alert/geofence                  (system-triggered, internal)
POST   /api/v1/alert/:id/acknowledge           (per-parent ack)
GET    /api/v1/alert/history/:familyGroupId?page

POST   /api/v1/zone
GET    /api/v1/zone/:familyGroupId
PATCH  /api/v1/zone/:id

PUT    /api/v1/user/profile
POST   /api/v1/user/upload-picture
DELETE /api/v1/user/:id/data                   (right-to-erasure — required for compliance)
```

Every family-scoped read (`location/history`, `alert/history`, `zone list`) must verify the requester's `family_group_id` matches the target resource server-side — not just client-side role checks.

---

## 6. Revised Alert Flow (SOS / Crash)

```
SOS tap → 10s cancelable countdown
  → capture GPS + (if audio consent active) 30s audio
  → POST /alert/sos → push (FCM) + WhatsApp template alert, sent in parallel to all family devices/numbers
  → if no parent ACK within 10s: automated TTS voice call to primary verified parent number
  → if no ACK within 30s more: automated TTS voice call to secondary parent/guardian (if registered)
  → parent app "Call Emergency" button always available → tel:1122 (Sindh/Karachi)
```

Same escalation ladder for confirmed crash alerts. Geofence and low-battery alerts stay push-only (no WhatsApp/voice-call escalation) to control cost and alert fatigue, and to keep voice calls scoped narrowly per the consent model in §2a.

---

## 7. Phased Roadmap (unchanged direction, restated)

1. **Phase 1 (MVP):** auth, family groups + consent logging, phone verification, live location, manual SOS with push+WhatsApp→voice-call escalation ladder.
2. **Phase 2:** geofencing with time windows, crash detection (accelerometer+gyro+speed fusion), audio capture with full consent flow.
3. **Phase 3 (bonus):** encrypted family chat, safe route planner, geofenced attendance — deliberately deferred, each is its own mini-project.

---

## 8. Open Items Needing a Legal/Ops Decision (not a dev call)

- Whether to route audio/location storage through a Pakistan-based or nearest-compliant regional data center now vs. after PDPB 2023 passes.
- Which telephony provider to contract for outbound TTS voice calls in Pakistan (Twilio Voice vs. a local voice API — coverage/cost/latency comparison needed), and which WhatsApp BSP (Infobip, Gupshup, etc.) for the Business API template alerts.
- Minimum age / guardian-consent wording for student accounts — should be reviewed by counsel given minors' data is involved.
- Legal sign-off on the voice-call consent wording against PTA anti-nuisance-call rules before launch.
