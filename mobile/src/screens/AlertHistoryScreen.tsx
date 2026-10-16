import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { radius, spacing, Theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AlertHistory'>;

interface AlertItem {
  id: string;
  type: 'sos' | 'crash' | 'geofence_enter' | 'geofence_exit' | 'low_battery';
  status: string;
  speed_mps: number | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

const TYPE_LABELS: Record<AlertItem['type'], string> = {
  sos: 'SOS',
  crash: 'Crash',
  geofence_enter: 'Entered safe zone',
  geofence_exit: 'Left safe zone',
  low_battery: 'Low battery',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  acknowledged: 'Acknowledged',
  escalated_whatsapp: 'WhatsApp escalated',
  escalated_call: 'Call escalated',
};

export default function AlertHistoryScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const c = theme.colors;
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadPage = useCallback(
    async (pageToLoad: number) => {
      if (!user?.familyGroupId) return;
      try {
        const result = await apiFetch<{ items: AlertItem[] }>(
          `/alert/history/${user.familyGroupId}?page=${pageToLoad}&pageSize=20`
        );
        setAlerts((prev) => (pageToLoad === 1 ? result.items : [...prev, ...result.items]));
        setHasMore(result.items.length === 20);
      } catch (err) {
        console.error('Failed to load alert history', err);
      } finally {
        setLoading(false);
      }
    },
    [user?.familyGroupId]
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  const loadMore = () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    loadPage(next);
  };

  const styles = makeStyles(theme);

  const renderItem = ({ item }: { item: AlertItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.typeLabel}>{TYPE_LABELS[item.type] ?? item.type}</Text>
        <Text style={[styles.statusLabel, item.status === 'acknowledged' && styles.statusAcknowledged]}>
          {STATUS_LABELS[item.status] ?? item.status}
        </Text>
      </View>
      <Text style={styles.timestamp}>{new Date(item.created_at).toLocaleString()}</Text>
      {item.latitude !== null && item.longitude !== null && (
        <Text style={styles.location}>
          {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
        </Text>
      )}
    </View>
  );

  if (loading && alerts.length === 0) {
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
      <Text style={styles.title}>Alert History</Text>

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<Text style={styles.empty}>No alerts yet.</Text>}
        ListFooterComponent={
          loading && alerts.length > 0 ? <ActivityIndicator color={c.beacon} style={styles.footer} /> : null
        }
      />
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
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    typeLabel: { fontWeight: '700', fontSize: 15, color: c.text },
    statusLabel: { color: c.beacon, fontWeight: '600', fontSize: 13 },
    statusAcknowledged: { color: c.mint },
    timestamp: { color: c.textMuted, fontSize: 13, marginBottom: spacing.xs },
    location: { color: c.textFaint, fontSize: 12 },
    empty: { color: c.textMuted, textAlign: 'center', marginTop: spacing.xl },
    footer: { marginVertical: spacing.md },
  });
}
