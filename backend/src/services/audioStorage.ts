import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';

const AUDIO_PREFIX = 'audio';

function s3Client(): S3Client | null {
  if (!env.s3.bucket || !env.s3.region) return null;
  return new S3Client({
    region: env.s3.region,
    credentials: env.s3.accessKeyId
      ? { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey }
      : undefined,
    endpoint: env.s3.endpoint || undefined,
    forcePathStyle: Boolean(env.s3.endpoint),
  });
}

function s3Url(key: string): string {
  if (env.s3.endpoint) return `${env.s3.endpoint}/${env.s3.bucket}/${key}`;
  return `https://${env.s3.bucket}.s3.${env.s3.region}.amazonaws.com/${key}`;
}

// Stores a transient SOS/crash audio clip. Uses S3-compatible storage when
// configured, otherwise falls back to local disk (dev only) so the full upload
// flow works end-to-end before external credentials are provisioned.
export async function storeAudio(
  buffer: Buffer,
  contentType: string,
  baseUrl: string
): Promise<{ url: string; local: boolean }> {
  const key = `${AUDIO_PREFIX}/${crypto.randomUUID()}.m4a`;

  const client = s3Client();
  if (client) {
    await client.send(
      new PutObjectCommand({
        Bucket: env.s3.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return { url: s3Url(key), local: false };
  }

  const dir = path.resolve(process.cwd(), 'uploads', AUDIO_PREFIX);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, path.basename(key)), buffer);
  return { url: `${baseUrl}/uploads/${key}`, local: true };
}
