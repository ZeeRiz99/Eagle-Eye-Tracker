import http from 'node:http';
import { createApp } from './app';
import { attachLocationSocket } from './realtime/locationSocket';
import { startGeofenceWorker } from './jobs/geofenceWorker';
import { env } from './config/env';

const app = createApp();
const httpServer = http.createServer(app);
attachLocationSocket(httpServer);

httpServer.listen(env.port, () => {
  console.log(`Eagle Eye Tracker backend listening on port ${env.port} (${env.nodeEnv})`);
});

startGeofenceWorker();
