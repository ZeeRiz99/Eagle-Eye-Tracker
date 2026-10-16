import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Audio } from 'expo-av';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';
import { radius, spacing, Theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AudioConsent'>;

// Consent screen for the highest-risk legal feature (spec §2): audio capture during
// SOS/Crash. OFF by default, explicit per-user opt-in, revocable any time.
// Every grant/revoke is logged immutably to consent_logs on the backend.
export default function AudioConsentScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const c = theme.colors;
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') setAudioEnabled(false);
    })();
  }, []);

  const logConsent = useCallback(
    async (granted: boolean) => {
      await apiFetch('/consent', {
        method: 'POST',
        body: { consentType: 'audio_recording', granted },
      });
    },
    []
  );

  const toggleAudio = async (value: boolean) => {
    if (value) {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone permission required', 'Enable microphone access in Settings to record emergency audio.');
        return;
      }
    }
    setLoading(true);
    try {
      await logConsent(value);
      setAudioEnabled(value);
      Alert.alert(
        value ? 'Audio recording enabled' : 'Audio recording disabled',
        value
          ? 'During an SOS or crash alert, up to 30 seconds of audio from your surroundings will be sent to your linked parent. This is only for emergency verification.'
          : 'No audio will be recorded during alerts.'
      );
    } catch {
      Alert.alert('Could not update consent', 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Emergency Audio Consent</Text>
      <Text style={styles.body}>
        During an SOS or crash alert, this app may record up to 30 seconds of audio from your surroundings and send it
        to your linked parent or guardian. This is only used for emergency verification and is automatically deleted
        after 72 hours.
      </Text>
      <Text style={styles.body}>
        This is off by default. You can enable or disable it any time from this screen. If disabled, your alerts still
        send your location — audio is simply not recorded.
      </Text>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Record emergency audio</Text>
        <Switch
          value={audioEnabled}
          onValueChange={toggleAudio}
          disabled={loading}
          trackColor={{ false: c.border, true: c.beacon }}
          thumbColor={audioEnabled ? c.text : c.textMuted}
        />
      </View>

      <Text style={styles.footnote}>
        Consent is logged with a timestamp on our servers. You are {user?.name ?? 'a member'} of this family group.
      </Text>

      <TouchableOpacity
        style={[styles.doneButton, loading && styles.disabled]}
        disabled={loading}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.doneButtonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(t: Theme) {
  const c = t.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.ink, padding: spacing.lg, justifyContent: 'center' },
    backButton: { position: 'absolute', top: 60, left: spacing.lg },
    backButtonText: { color: c.beaconSoft, fontWeight: '600', fontSize: 16 },
    title: { fontSize: 24, fontWeight: '800', marginBottom: spacing.md, textAlign: 'center', color: c.text },
    body: { fontSize: 15, color: c.textMuted, lineHeight: 22, marginBottom: spacing.md },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    toggleLabel: { fontSize: 16, fontWeight: '700', color: c.text },
    footnote: { fontSize: 12, color: c.textFaint, marginBottom: spacing.lg },
    doneButton: {
      backgroundColor: c.beacon,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    doneButtonText: { color: c.ink, fontWeight: '700', fontSize: 16 },
    disabled: { opacity: 0.6 },
  });
}
