import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, getAccessToken } from '../api/client';

export interface LiveLocationEvent {
  userId: string;
  latitude: number;
  longitude: number;
  speedMps?: number;
  accuracyM?: number;
  batteryPct?: number;
  recordedAt: string;
}

// Single live-location channel per spec §3: WebSocket only, no redundant REST polling.
export function useLocationSocket(onLiveLocation?: (event: LiveLocationEvent) => void) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;

      const socket = io(API_BASE_URL, { path: '/ws/location', auth: { token } });
      socketRef.current = socket;

      if (onLiveLocation) {
        socket.on('location:live', onLiveLocation);
      }
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [onLiveLocation]);

  const sendLocationUpdate = (payload: {
    latitude: number;
    longitude: number;
    speedMps?: number;
    accuracyM?: number;
    batteryPct?: number;
  }) => {
    socketRef.current?.emit('location:update', payload);
  };

  return { sendLocationUpdate };
}
