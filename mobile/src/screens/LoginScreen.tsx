import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';
import { radius, spacing, Theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const { theme } = useTheme();
  const c = theme.colors;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      Alert.alert('Login failed', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <Text style={styles.markDot} />
        <Text style={styles.markRing} />
      </View>
      <Text style={styles.title}>Eagle Eye Tracker</Text>
      <Text style={styles.tagline}>Your family&apos;s guardian in the dark.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={c.textFaint}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={c.textFaint}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={c.ink} /> : <Text style={styles.buttonText}>Log In</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>Need an account? Register</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(t: Theme) {
  const c = t.colors;
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: c.ink },
    mark: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
      borderWidth: 2,
      borderColor: c.beacon,
    },
    markDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: c.beacon },
    markRing: {
      position: 'absolute',
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.beacon,
      opacity: 0.4,
    },
    title: { fontSize: 28, fontWeight: '800', marginBottom: spacing.xs, textAlign: 'center', color: c.text },
    tagline: { color: c.textMuted, textAlign: 'center', marginBottom: spacing.xl, fontSize: 15 },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      color: c.text,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: spacing.sm,
      fontSize: 16,
    },
    button: {
      backgroundColor: c.beacon,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    buttonText: { color: c.ink, fontWeight: '700', fontSize: 16 },
    link: { color: c.beaconSoft, textAlign: 'center', marginTop: spacing.md },
  });
}
