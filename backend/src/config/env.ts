import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  fcm: {
    projectId: process.env.FCM_PROJECT_ID ?? '',
    clientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
    privateKey: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },
  s3: {
    bucket: process.env.S3_BUCKET ?? '',
    region: process.env.S3_REGION ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    endpoint: process.env.S3_ENDPOINT ?? '',
  },
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL ?? '',
    apiToken: process.env.WHATSAPP_API_TOKEN ?? '',
    sosTemplateName: process.env.WHATSAPP_SOS_TEMPLATE_NAME ?? 'sos_alert',
  },
  voice: {
    accountSid: process.env.VOICE_API_ACCOUNT_SID ?? '',
    authToken: process.env.VOICE_API_AUTH_TOKEN ?? '',
    fromNumber: process.env.VOICE_API_FROM_NUMBER ?? '',
  },
  mapsApiKey: process.env.MAPS_API_KEY ?? '',
};
