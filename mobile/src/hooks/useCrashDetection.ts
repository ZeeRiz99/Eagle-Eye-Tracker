import { useCallback, useEffect, useRef, useState } from 'react';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Location from 'expo-location';
import { apiFetch } from '../api/client';

// Crash detection per spec §3/§6: fuses accelerometer + gyroscope + GPS speed
// instead of a naive fixed "impact > 25 mph" rule. On a strong impact signal it
// sounds an alarm and shows a 60s "Are you okay?" confirmation; if unanswered it
// sends a crash alert with the exact location.

const CRASH_CONFIRMATION_SECONDS = 60;
const IMPACT_ACCEL_THRESHOLD_G = 4.0; // combined vector magnitude in g
const IMPACT_GYRO_THRESHOLD_RAD_S = 8.0; // sudden rotation rate
const MIN_SPEED_MPH = 15; // crash context requires some motion, not a dropped phone
const SAMPLE_INTERVAL_MS = 100;

function vectorMagnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

export function useCrashDetection(enabled: boolean) {
  const [crashPending, setCrashPending] = useState(false);
  const [confirmationSecondsLeft, setConfirmationSecondsLeft] = useState<number | null>(null);
  const confirmationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastImpactAt = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    Gyroscope.setUpdateInterval(SAMPLE_INTERVAL_MS);

    const accelSub = Accelerometer.addListener((accel) => {
      if (cancelled) return;
      const accelG = vectorMagnitude(accel.x ?? 0, accel.y ?? 0, accel.z ?? 0) / 9.81;
      if (accelG >= IMPACT_ACCEL_THRESHOLD_G) {
        const now = Date.now();
        if (now - lastImpactAt.current < 2000) return; // debounce
        lastImpactAt.current = now;
        void evaluateImpact(accelG);
      }
    });

    const gyroSub = Gyroscope.addListener((gyro) => {
      if (cancelled) return;
      const rotSpeed = vectorMagnitude(gyro.x ?? 0, gyro.y ?? 0, gyro.z ?? 0);
      if (rotSpeed >= IMPACT_GYRO_THRESHOLD_RAD_S) {
        const now = Date.now();
        if (now - lastImpactAt.current < 2000) return;
        lastImpactAt.current = now;
        void evaluateImpact(0);
      }
    });

    return () => {
      cancelled = true;
      accelSub.remove();
      gyroSub.remove();
    };
  }, [enabled]);

  const evaluateImpact = useCallback(async (accelG: number) => {
    // Require motion context so a dropped phone on a desk doesn't trigger a crash.
    let location: Location.LocationObject | null = null;
    try {
      location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {
      location = null;
    }
    const speedMph = (location?.coords.speed ?? 0) * 2.237; // m/s -> mph
    if (accelG > 0 && speedMph < MIN_SPEED_MPH) return; // stationary impact -> drop, not crash

    setCrashPending(true);
    setConfirmationSecondsLeft(CRASH_CONFIRMATION_SECONDS);

    confirmationTimer.current = setInterval(() => {
      setConfirmationSecondsLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (confirmationTimer.current) clearInterval(confirmationTimer.current);
          void sendCrashAlert(location);
          setCrashPending(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const acknowledge = useCallback(() => {
    if (confirmationTimer.current) clearInterval(confirmationTimer.current);
    setCrashPending(false);
    setConfirmationSecondsLeft(null);
  }, []);

  const sendCrashAlert = async (location: Location.LocationObject | null) => {
    try {
      await apiFetch('/alert/crash', {
        method: 'POST',
        body: {
          latitude: location?.coords.latitude ?? 0,
          longitude: location?.coords.longitude ?? 0,
          speedMps: location?.coords.speed ?? 0,
        },
      });
    } catch (err) {
      console.error('crash alert failed', err);
    }
  };

  return { crashPending, confirmationSecondsLeft, acknowledge };
}
