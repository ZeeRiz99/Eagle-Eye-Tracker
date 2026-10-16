import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';
import { radius, spacing, Theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SchoolDetails'>;

interface FamilyMember {
  id: string;
  name: string;
  role: 'parent' | 'student';
  school_name: string | null;
  school_start_time: string | null;
  school_end_time: string | null;
}

// Shows and edits the current user's school details. A parent manages their own
// record here; the parent dashboard lists every student's details (spec §3).
export default function SchoolDetailsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const c = theme.colors;
  const [schoolName, setSchoolName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<FamilyMember[]>('/family/members');
      setMembers(list);
      const me = list.find((m) => m.id === user?.id);
      if (me) {
        setSchoolName(me.school_name ?? '');
        setStartTime(me.school_start_time ? me.school_start_time.slice(0, 5) : '');
        setEndTime(me.school_end_time ? me.school_end_time.slice(0, 5) : '');
      }
    } catch (err) {
      Alert.alert('Could not load school details', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!schoolName.trim()) {
      Alert.alert('School name required', 'Enter the school name before saving.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/user/school', {
        method: 'PUT',
        body: {
          schoolName: schoolName.trim(),
          ...(startTime.trim() ? { schoolStartTime: startTime.trim() } : {}),
          ...(endTime.trim() ? { schoolEndTime: endTime.trim() } : {}),
        },
      });
      Alert.alert('Saved', 'School details updated.');
      await load();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setSaving(false);
    }
  };

  const styles = makeStyles(theme);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.beacon} />
      </View>
    );
  }

  const students = members.filter((m) => m.role === 'student');

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>School Details</Text>

      <Text style={styles.sectionLabel}>My school</Text>
      <TextInput
        style={styles.input}
        placeholder="School name"
        placeholderTextColor={c.textFaint}
        value={schoolName}
        onChangeText={setSchoolName}
      />
      <View style={styles.timeRow}>
        <TextInput
          style={[styles.input, styles.timeInput]}
          placeholder="Start time (HH:MM)"
          placeholderTextColor={c.textFaint}
          value={startTime}
          onChangeText={setStartTime}
        />
        <TextInput
          style={[styles.input, styles.timeInput]}
          placeholder="End time (HH:MM)"
          placeholderTextColor={c.textFaint}
          value={endTime}
          onChangeText={setEndTime}
        />
      </View>
      <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color={c.ink} /> : <Text style={styles.saveButtonText}>Save Details</Text>}
      </TouchableOpacity>

      {user?.role === 'parent' && (
        <>
          <Text style={styles.sectionLabel}>Students in your family</Text>
          {students.length === 0 ? (
            <Text style={styles.empty}>No students in this family yet.</Text>
          ) : (
            students.map((student) => (
              <View key={student.id} style={styles.studentCard}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.studentSchool}>{student.school_name ?? 'No school set'}</Text>
                {student.school_start_time && student.school_end_time ? (
                  <Text style={styles.studentTimes}>
                    {student.school_start_time.slice(0, 5)} – {student.school_end_time.slice(0, 5)}
                  </Text>
                ) : (
                  <Text style={styles.studentTimes}>Timings not set</Text>
                )}
              </View>
            ))
          )}
        </>
      )}
    </View>
  );
}

function makeStyles(t: Theme) {
  const c = t.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.ink, padding: spacing.lg, paddingTop: 60 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.ink },
    backButton: { marginBottom: spacing.sm },
    backButtonText: { color: c.beaconSoft, fontWeight: '600', fontSize: 16 },
    title: { fontSize: 24, fontWeight: '800', marginBottom: spacing.md, color: c.text },
    sectionLabel: { fontSize: 14, color: c.textMuted, marginBottom: spacing.sm, marginTop: spacing.md },
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
    timeRow: { flexDirection: 'row', gap: spacing.sm },
    timeInput: { flex: 1 },
    saveButton: {
      backgroundColor: c.beacon,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    saveButtonText: { color: c.ink, fontWeight: '700', fontSize: 16 },
    empty: { color: c.textMuted, textAlign: 'center', marginTop: spacing.sm },
    studentCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    studentName: { fontWeight: '700', fontSize: 15, color: c.text },
    studentSchool: { color: c.beaconSoft, fontSize: 13, marginTop: 2 },
    studentTimes: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  });
}
