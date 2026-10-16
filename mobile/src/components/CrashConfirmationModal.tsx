import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing, Theme } from '../theme';

interface Props {
  visible: boolean;
  secondsLeft: number | null;
  onAcknowledge: () => void;
}

// Full-screen "Are you okay?" prompt shown for 60s after a detected impact
// (spec §3). If the student doesn't tap I'm Okay, the crash alert auto-fires.
export default function CrashConfirmationModal({ visible, secondsLeft, onAcknowledge }: Props) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <View style={styles.overlay}>
        <Text style={styles.title}>Are you okay?</Text>
        <Text style={styles.subtitle}>An impact was detected. Confirming you&apos;re safe cancels the crash alert.</Text>
        <Text style={styles.timer}>{secondsLeft ?? 60}</Text>
        <Text style={styles.timerLabel}>seconds until alert is sent automatically</Text>

        <TouchableOpacity style={styles.okayButton} onPress={onAcknowledge}>
          <Text style={styles.okayButtonText}>I&apos;m Okay</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function makeStyles(t: Theme) {
  const c = t.colors;
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: c.ink, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
    title: { color: c.text, fontSize: 36, fontWeight: '800', marginBottom: spacing.sm },
    subtitle: { color: c.textMuted, fontSize: 16, textAlign: 'center', marginBottom: spacing.xl },
    timer: { color: c.beacon, fontSize: 72, fontWeight: '800' },
    timerLabel: { color: c.textMuted, fontSize: 14, marginBottom: spacing.xl, textAlign: 'center' },
    okayButton: {
      backgroundColor: c.mint,
      borderRadius: radius.md,
      paddingVertical: 16,
      paddingHorizontal: 48,
    },
    okayButtonText: { color: c.ink, fontWeight: '700', fontSize: 18 },
  });
}
