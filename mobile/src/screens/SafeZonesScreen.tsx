import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, MapPressEvent } from 'react-native-maps';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';
import { darkMapStyle, lightMapStyle, radius, spacing, Theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SafeZones'>;

interface SafeZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  active_from: string | null;
  active_to: string | null;
  is_active: boolean;
}

const KARACHI_REGION = { latitude: 24.8607, longitude: 67.0011, latitudeDelta: 0.08, longitudeDelta: 0.08 };

export default function SafeZonesScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { theme, mode } = useTheme();
  const c = theme.colors;
  const mapStyle = mode === 'dark' ? darkMapStyle : lightMapStyle;
  const [zones, setZones] = useState<SafeZone[]>([]);
  const [loading, setLoading] = useState(true);

  const [zoneCenter, setZoneCenter] = useState(KARACHI_REGION);
  const [name, setName] = useState('');
  const [radiusM, setRadiusM] = useState('500');
  const [activeFrom, setActiveFrom] = useState('');
  const [activeTo, setActiveTo] = useState('');
  const [saving, setSaving] = useState(false);

  const loadZones = useCallback(async () => {
    if (!user?.familyGroupId) return;
    try {
      const result = await apiFetch<SafeZone[]>(`/zone/${user.familyGroupId}`);
      setZones(result);
    } catch (err) {
      Alert.alert('Could not load safe zones', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setLoading(false);
    }
  }, [user?.familyGroupId]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  const onMapPress = (event: MapPressEvent) => {
    setZoneCenter({ ...event.nativeEvent.coordinate, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  };

  const createZone = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Give this safe zone a name, e.g. Home, School, Gym.');
      return;
    }
    const radius = Number(radiusM);
    if (!Number.isFinite(radius) || radius < 10 || radius > 10000) {
      Alert.alert('Invalid radius', 'Radius must be between 10 and 10,000 meters.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/zone', {
        method: 'POST',
        body: {
          name: name.trim(),
          latitude: zoneCenter.latitude,
          longitude: zoneCenter.longitude,
          radiusM: radius,
          ...(activeFrom.trim() ? { activeFrom: activeFrom.trim() } : {}),
          ...(activeTo.trim() ? { activeTo: activeTo.trim() } : {}),
        },
      });
      setName('');
      setRadiusM('500');
      setActiveFrom('');
      setActiveTo('');
      await loadZones();
    } catch (err) {
      Alert.alert('Could not create zone', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setSaving(false);
    }
  };

  const toggleZone = async (zone: SafeZone) => {
    try {
      await apiFetch(`/zone/${zone.id}`, { method: 'PATCH', body: { isActive: !zone.is_active } });
      await loadZones();
    } catch (err) {
      Alert.alert('Could not update zone', err instanceof Error ? err.message : 'Please try again');
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

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Safe Zones</Text>

      <ScrollView>
        <Text style={styles.sectionLabel}>Tap the map to set a zone center, then fill in the details.</Text>
        <MapView style={styles.map} region={zoneCenter} onPress={onMapPress} customMapStyle={mapStyle}>
          <Marker
            coordinate={{ latitude: zoneCenter.latitude, longitude: zoneCenter.longitude }}
            pinColor={c.mint}
            title={name.trim() || 'New zone'}
          />
        </MapView>

        <TextInput
          style={styles.input}
          placeholder="Zone name (e.g. Home, School)"
          placeholderTextColor={c.textFaint}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Radius in meters"
          placeholderTextColor={c.textFaint}
          keyboardType="number-pad"
          value={radiusM}
          onChangeText={setRadiusM}
        />
        <View style={styles.timeRow}>
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="Active from (HH:MM, optional)"
            placeholderTextColor={c.textFaint}
            value={activeFrom}
            onChangeText={setActiveFrom}
          />
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="Active to (HH:MM, optional)"
            placeholderTextColor={c.textFaint}
            value={activeTo}
            onChangeText={setActiveTo}
          />
        </View>
        <TouchableOpacity style={styles.createButton} onPress={createZone} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={c.ink} />
          ) : (
            <Text style={styles.createButtonText}>Create Safe Zone</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Existing zones</Text>
        {zones.length === 0 ? (
          <Text style={styles.empty}>No safe zones yet.</Text>
        ) : (
          zones.map((zone) => (
            <View key={zone.id} style={styles.zoneCard}>
              <View style={styles.zoneCardHeader}>
                <Text style={styles.zoneName}>{zone.name}</Text>
                <Switch
                  value={zone.is_active}
                  onValueChange={() => toggleZone(zone)}
                  trackColor={{ false: c.border, true: c.mint }}
                  thumbColor={zone.is_active ? c.ink : c.textMuted}
                />
              </View>
              <Text style={styles.zoneMeta}>
                {zone.latitude.toFixed(5)}, {zone.longitude.toFixed(5)} · {zone.radius_m}m
                {zone.active_from && zone.active_to ? ` · ${zone.active_from}–${zone.active_to}` : ' · Always active'}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
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
    title: { fontSize: 24, fontWeight: '800', marginBottom: spacing.sm, color: c.text },
    sectionLabel: { fontSize: 14, color: c.textMuted, marginBottom: spacing.sm, marginTop: spacing.sm },
    map: { width: '100%', height: 220, borderRadius: radius.md, marginBottom: spacing.md },
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
    createButton: {
      backgroundColor: c.mint,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    createButtonText: { color: c.ink, fontWeight: '700', fontSize: 16 },
    zoneCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    zoneCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
    zoneName: { fontWeight: '700', fontSize: 15, color: c.text },
    zoneMeta: { color: c.textMuted, fontSize: 12 },
    empty: { color: c.textMuted, textAlign: 'center', marginTop: spacing.sm },
  });
}
