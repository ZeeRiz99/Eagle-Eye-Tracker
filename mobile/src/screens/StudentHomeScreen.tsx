import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiFetch, uploadAudio } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLocationSocket } from '../hooks/useLocationSocket';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useCrashDetection } from '../hooks/useCrashDetection';
import CrashConfirmationModal from '../components/CrashConfirmationModal';
import type { RootStackParamList } from '../navigation/types';
import { darkMapStyle, lightMapStyle, radius, spacing, Theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'StudentHome'>;

const SOS_COUNTDOWN_SECONDS = 10;
// Karachi coordinates as the default map region before the first GPS fix.
const KARACHI_REGION = { latitude: 24.8607, longitude: 67.0011, latitudeDelta: 0.05, longitudeDelta: 0.05 };

export default function StudentHomeScreen({ navigation }: Props) {
  const { theme, mode } = useTheme();
  const c = theme.colors;
  const mapStyle = mode === 'dark' ? darkMapStyle : lightMapStyle;
  const [sharingLocation, setSharingLocation] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchSubscription = useRef<Location.LocationSubscription | null>(null);

  const { logout } = useAuth();
  const { sendLocationUpdate } = useLocationSocket();
  const { startRecording, stopRecording, isRecording } = useAudioRecorder();
  const { crashPending, confirmationSecondsLeft, acknowledge } = useCrashDetection(true);

  useEffect(() => {
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      watchSubscription.current?.remove();
    };
  }, []);

  const toggleShareLocation = async () => {
    if (sharingLocation) {
      watchSubscription.current?.remove();
      watchSubscription.current = null;
      setSharingLocation(false);
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Location permission is needed to share your location with your family.');
      return;
    }

    watchSubscription.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      (location) => {
        setCurrentLocation(location);
        sendLocationUpdate({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speedMps: location.coords.speed ?? undefined,
          accuracyM: location.coords.accuracy ?? undefined,
        });
      }
    );
    setSharingLocation(true);
  };

  const startSosCountdown = async () => {
    // Start the 30s audio capture immediately (consent-gated in the recorder);
    // the countdown continues regardless so SOS never blocks on the mic.
    try {
      await startRecording();
    } catch {
      // Mic unavailable or denied — proceed silently; location-only alert is fine.
    }
    setCountdown(SOS_COUNTDOWN_SECONDS);
    countdownTimer.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (countdownTimer.current) clearInterval(countdownTimer.current);
          triggerSos();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSosCountdown = () => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    setCountdown(null);
    void stopRecording(); // cancelled — discard any partial recording
  };

  const triggerSos = async () => {
    let audioUrl: string | undefined;
    const recording = await stopRecording();
    if (recording?.uri) {
      try {
        const upload = await uploadAudio(recording.uri);
        audioUrl = upload.url;
      } catch {
        // Upload failed — proceed with a location-only alert; don't block SOS on storage.
        audioUrl = undefined;
      }
    }
    try {
      const location =
        currentLocation ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      await apiFetch('/alert/sos', {
        method: 'POST',
        body: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          ...(audioUrl ? { audioUrl } : {}),
        },
      });
      Alert.alert('SOS Sent', 'Your family has been notified with your location.');
    } catch (err) {
      Alert.alert('SOS failed to send', err instanceof Error ? err.message : 'Please try again or call for help directly.');
    }
  };

  const mapRegion = currentLocation
    ? {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }
    : KARACHI_REGION;

  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Eagle Eye Tracker</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>

      <MapView style={styles.map} region={mapRegion} customMapStyle={mapStyle}>
        {currentLocation && (
          <Marker
            coordinate={{
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
            }}
            title="You"
            pinColor={c.beacon}
          />
        )}
      </MapView>

      <TouchableOpacity style={[styles.shareToggle, sharingLocation && styles.shareToggleActive]} onPress={toggleShareLocation}>
        <View style={[styles.shareDot, sharingLocation && styles.shareDotActive]} />
        <Text style={[styles.shareToggleText, sharingLocation && styles.shareToggleTextActive]}>
          {sharingLocation ? 'Sharing Location — Tap to Stop' : 'Location Not Shared — Tap to Start'}
        </Text>
      </TouchableOpacity>

      <View style={styles.sosArea}>
        <View style={styles.quickLinks}>
          <TouchableOpacity style={styles.quickLinkButton} onPress={() => navigation.navigate('SchoolDetails')}>
            <Text style={styles.quickLinkText}>School</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickLinkButton} onPress={() => navigation.navigate('AudioConsent')}>
            <Text style={styles.quickLinkText}>Audio</Text>
          </TouchableOpacity>
        </View>

        {countdown === null ? (
          <>
            <TouchableOpacity style={styles.sosButton} onPress={startSosCountdown}>
              <Text style={styles.sosButtonText}>SOS</Text>
              {isRecording && <Text style={styles.recordingBadge}>REC</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.callButton} onPress={() => Linking.openURL('tel:1122')}>
              <Text style={styles.callButtonText}>Call 1122</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.countdownBox}>
            <Text style={styles.countdownNumber}>{countdown}</Text>
            <Text style={styles.countdownLabel}>Sending SOS alert...</Text>
            <TouchableOpacity style={styles.cancelButton} onPress={cancelSosCountdown}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <CrashConfirmationModal
        visible={crashPending}
        secondsLeft={confirmationSecondsLeft}
        onAcknowledge={acknowledge}
      />
    </View>
  );
}

function makeStyles(t: Theme) {
  const c = t.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.ink, paddingTop: 60, alignItems: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    title: { fontSize: 22, fontWeight: '800', color: c.text },
    logoutButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
    logoutText: { color: c.textMuted, fontWeight: '600', fontSize: 14 },
    map: { width: '100%', height: 300 },
    shareToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.pill,
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.md,
    },
    shareToggleActive: { borderColor: c.beacon, backgroundColor: c.surfaceRaised },
    shareDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.textFaint },
    shareDotActive: { backgroundColor: c.mint },
    shareToggleText: { color: c.textMuted, fontWeight: '600' },
    shareToggleTextActive: { color: c.text },
    sosArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    quickLinks: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    quickLinkButton: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.sm,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
    },
    quickLinkText: { color: c.beaconSoft, fontWeight: '600', fontSize: 15 },
    sosButton: {
      width: 160,
      height: 160,
      borderRadius: 80,
      backgroundColor: c.danger,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 8,
      shadowColor: c.danger,
      shadowOpacity: 0.5,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
    },
    sosButtonText: { color: '#fff', fontSize: 36, fontWeight: '800' },
    recordingBadge: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: spacing.xs },
    callButton: {
      backgroundColor: c.surfaceRaised,
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: radius.sm,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.md,
    },
    callButtonText: { color: c.danger, fontWeight: '700', fontSize: 14 },
    countdownBox: { alignItems: 'center' },
    countdownNumber: { fontSize: 72, fontWeight: '800', color: c.danger },
    countdownLabel: { fontSize: 16, color: c.textMuted, marginBottom: spacing.lg },
    cancelButton: { backgroundColor: c.text, borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 32 },
    cancelButtonText: { color: c.ink, fontWeight: '600', fontSize: 16 },
  });
}
