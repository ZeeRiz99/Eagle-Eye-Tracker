import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing, Theme } from '../theme';

// Parents generate an expiring, single-use invite code (spec §4); students consume it to join.
export default function FamilySetupScreen() {
  const { user, setFamilyGroupId } = useAuth();
  const { theme } = useTheme();
  const c = theme.colors;
  const [inviteCode, setInviteCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const generateInvite = async () => {
    setSubmitting(true);
    try {
      const result = await apiFetch<{ id: string; invite_code: string }>('/family/invite', {
        method: 'POST',
        body: { name: `${user?.name ?? 'My'} Family` },
      });
      setGeneratedCode(result.invite_code);
      setFamilyGroupId(result.id);
    } catch (err) {
      Alert.alert('Could not generate invite', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const joinFamily = async () => {
    setSubmitting(true);
    try {
      const result = await apiFetch<{ familyGroupId: string }>('/family/join', {
        method: 'POST',
        body: { inviteCode: inviteCode.trim() },
      });
      setFamilyGroupId(result.familyGroupId);
    } catch (err) {
      Alert.alert('Could not join family', err instanceof Error ? err.message : 'Invalid or expired code');
    } finally {
      setSubmitting(false);
    }
  };

  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Family Group</Text>

      {user?.role === 'parent' ? (
        <>
          <Text style={styles.subtitle}>Generate an invite code for your student to join.</Text>
          <TouchableOpacity style={styles.button} onPress={generateInvite} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={c.ink} />
            ) : (
              <Text style={styles.buttonText}>Generate Invite Code</Text>
            )}
          </TouchableOpacity>
          {generatedCode && (
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>Share this code (expires in 24h, single use):</Text>
              <Text style={styles.code}>{generatedCode}</Text>
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={styles.subtitle}>Enter the invite code your parent shared with you.</Text>
          <TextInput
            style={styles.input}
            placeholder="Invite code"
            placeholderTextColor={c.textFaint}
            autoCapitalize="characters"
            value={inviteCode}
            onChangeText={setInviteCode}
          />
          <TouchableOpacity style={styles.button} onPress={joinFamily} disabled={submitting}>
            {submitting ? <ActivityIndicator color={c.ink} /> : <Text style={styles.buttonText}>Join Family</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function makeStyles(t: Theme) {
  const c = t.colors;
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: c.ink },
    title: { fontSize: 26, fontWeight: '800', marginBottom: spacing.sm, textAlign: 'center', color: c.text },
    subtitle: { fontSize: 15, color: c.textMuted, marginBottom: spacing.lg, textAlign: 'center' },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      color: c.text,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: spacing.md,
      textAlign: 'center',
      letterSpacing: 2,
      fontSize: 16,
    },
    button: {
      backgroundColor: c.beacon,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    buttonText: { color: c.ink, fontWeight: '700', fontSize: 16 },
    codeBox: { marginTop: spacing.lg, alignItems: 'center' },
    codeLabel: { color: c.textMuted, marginBottom: spacing.sm },
    code: { fontSize: 32, fontWeight: '800', letterSpacing: 4, color: c.beacon },
  });
}
