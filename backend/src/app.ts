import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRouter } from './routes/auth';
import { familyRouter } from './routes/family';
import { devicesRouter } from './routes/devices';
import { consentRouter } from './routes/consent';
import { phoneRouter } from './routes/phone';
import { locationRouter } from './routes/location';
import { zoneRouter } from './routes/zone';
import { alertRouter } from './routes/alert';
import { userRouter } from './routes/user';
import { uploadRouter } from './routes/upload';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Local-dev fallback for transient SOS audio when S3 isn't configured.
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/family', familyRouter);
  app.use('/api/v1/devices', devicesRouter);
  app.use('/api/v1/consent', consentRouter);
  app.use('/api/v1/user/phone', phoneRouter);
  app.use('/api/v1/location', locationRouter);
  app.use('/api/v1/zone', zoneRouter);
  app.use('/api/v1/alert', alertRouter);
  app.use('/api/v1/user', userRouter);
  app.use('/api/v1/upload', uploadRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
