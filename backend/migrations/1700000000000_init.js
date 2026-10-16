/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });
  pgm.createExtension('postgis', { ifNotExists: true });
  pgm.createExtension('timescaledb', { ifNotExists: true });

  pgm.createTable('family_groups', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    invite_code: { type: 'text', notNull: true, unique: true },
    invite_code_expires_at: { type: 'timestamptz', notNull: true },
    invite_code_used: { type: 'boolean', notNull: true, default: false },
    created_by: { type: 'uuid' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    email: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'text', notNull: true, check: "role IN ('parent','student')" },
    profile_picture_url: { type: 'text' },
    family_group_id: { type: 'uuid', references: 'family_groups', onDelete: 'SET NULL' },
    date_of_birth: { type: 'date' },
    phone_number: { type: 'text' },
    phone_verified_at: { type: 'timestamptz' },
    discreet_mode_enabled: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('family_groups', 'family_groups_created_by_fkey', {
    foreignKeys: {
      columns: 'created_by',
      references: 'users(id)',
      onDelete: 'SET NULL',
    },
  });

  pgm.createTable('phone_otps', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    phone_number: { type: 'text', notNull: true },
    code_hash: { type: 'text', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    consumed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('consent_logs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    consent_type: {
      type: 'text',
      notNull: true,
      check: "consent_type IN ('audio_recording','location_sharing','voice_call_alert','tos')",
    },
    granted: { type: 'boolean', notNull: true },
    app_version: { type: 'text' },
    ip_address: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('devices', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    fcm_token: { type: 'text', notNull: true },
    platform: { type: 'text', notNull: true, check: "platform IN ('android','ios','watch')" },
    last_seen_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('devices', 'devices_user_token_unique', {
    unique: ['user_id', 'fcm_token'],
  });

  pgm.createTable('locations', {
    id: { type: 'bigserial', notNull: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    geom: { type: 'geography(Point,4326)', notNull: true },
    speed_mps: { type: 'numeric' },
    accuracy_m: { type: 'numeric' },
    battery_pct: { type: 'smallint' },
    recorded_at: { type: 'timestamptz', notNull: true },
  });
  pgm.sql("SELECT create_hypertable('locations', 'recorded_at', if_not_exists => TRUE);");
  pgm.createIndex('locations', 'user_id');
  pgm.createIndex('locations', 'geom', { method: 'gist' });

  pgm.createTable('safe_zones', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_group_id: { type: 'uuid', notNull: true, references: 'family_groups', onDelete: 'CASCADE' },
    name: { type: 'text', notNull: true },
    center: { type: 'geography(Point,4326)', notNull: true },
    radius_m: { type: 'integer', notNull: true },
    active_from: { type: 'time' },
    active_to: { type: 'time' },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('alerts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    type: {
      type: 'text',
      notNull: true,
      check: "type IN ('sos','crash','geofence_enter','geofence_exit','low_battery')",
    },
    student_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    family_group_id: { type: 'uuid', notNull: true, references: 'family_groups', onDelete: 'CASCADE' },
    location: { type: 'geography(Point,4326)' },
    speed_mps: { type: 'numeric' },
    audio_url: { type: 'text' },
    audio_expires_at: { type: 'timestamptz' },
    status: {
      type: 'text',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending','delivered','acknowledged','escalated_whatsapp','escalated_call')",
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('alerts', 'family_group_id');
  pgm.createIndex('alerts', 'student_id');

  pgm.createTable('alert_acknowledgements', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    alert_id: { type: 'uuid', notNull: true, references: 'alerts', onDelete: 'CASCADE' },
    parent_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    acknowledged_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('alert_acknowledgements', 'alert_ack_unique', {
    unique: ['alert_id', 'parent_id'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('alert_acknowledgements');
  pgm.dropTable('alerts');
  pgm.dropTable('safe_zones');
  pgm.dropTable('locations');
  pgm.dropTable('devices');
  pgm.dropTable('consent_logs');
  pgm.dropTable('phone_otps');
  pgm.dropConstraint('family_groups', 'family_groups_created_by_fkey');
  pgm.dropTable('users');
  pgm.dropTable('family_groups');
};
