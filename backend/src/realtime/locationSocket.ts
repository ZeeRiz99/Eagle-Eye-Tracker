import { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { pool } from '../db/pool';
import { verifyAccessToken } from '../utils/jwt';

interface LocationUpdatePayload {
  latitude: number;
  longitude: number;
  speedMps?: number;
  accuracyM?: number;
  batteryPct?: number;
}

// Live location stream (WS /ws/location). Client pushes updates here; the server persists
// a batched sample to Postgres and re-broadcasts to the student's family room for live map views.
// REST POST /location/update is intentionally NOT implemented — see spec §3, one channel only,
// to avoid redundant battery/data usage from dual ingestion paths.
export function attachLocationSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, { path: '/ws/location', cors: { origin: '*' } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Missing auth token'));
    try {
      socket.data.user = verifyAccessToken(token);
      return next();
    } catch {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as ReturnType<typeof verifyAccessToken>;
    if (user.familyGroupId) {
      socket.join(`family:${user.familyGroupId}`);
    }

    let lastPersistedAt = 0;
    const PERSIST_INTERVAL_MS = 5000; // batch-persist, don't write every single update

    socket.on('location:update', async (payload: LocationUpdatePayload) => {
      if (user.familyGroupId) {
        socket.to(`family:${user.familyGroupId}`).emit('location:live', {
          userId: user.sub,
          ...payload,
          recordedAt: new Date().toISOString(),
        });
      }

      const now = Date.now();
      if (now - lastPersistedAt >= PERSIST_INTERVAL_MS) {
        lastPersistedAt = now;
        await pool.query(
          `INSERT INTO locations (user_id, geom, speed_mps, accuracy_m, battery_pct, recorded_at)
           VALUES ($1, ST_MakePoint($2, $3)::geography, $4, $5, $6, now())`,
          [user.sub, payload.longitude, payload.latitude, payload.speedMps ?? null, payload.accuracyM ?? null, payload.batteryPct ?? null]
        );
      }
    });
  });

  return io;
}
