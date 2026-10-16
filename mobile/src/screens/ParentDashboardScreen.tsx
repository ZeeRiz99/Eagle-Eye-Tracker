import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Notifications from 'expo-notifications';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLocationSocket, LiveLocationEvent } from '../hooks/useLocationSocket';
import { useNotificationTapHandler, extractEmergencyData, EmergencyNotificationData } from '../hooks/useNotificationTap';
import type { RootStackParamList } from '../navigation/types';
import { darkMapStyle, lightMapStyle, radius, spacing, Theme } from '../theme';

interface EmergencyAlert {
  id: string;
  studentName: string;
  latitude: number;
  longitude: number;
}

interface FamilyMember {
  id: string;
  name: string;
  role: 'parent' | 'student';
  profile_picture_url: string | null;
}

type Props = NativeStackScreenProps<RootStackParamList, 'ParentDashboard'>;

const RESCUE_1122_NUMBER = '1122'; // Sindh Emergency Rescue Service — no dispatch API exists, tel: only (spec §1)
const KARACHI_REGION = { latitude: 24.8607, longitude: 67.0011, latitudeDelta: 0.08, longitudeDelta: 0.08 };

export default function ParentDashboardScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { theme, mode, toggleTheme } = useTheme();
  const c = theme.colors;
  const mapStyle = mode === 'dark' ? darkMapStyle : lightMapStyle;

  const [liveLocations, setLiveLocations] = useState<Record<string, LiveLocationEvent>>({});
  const [activeAlert, setActiveAlert] = useState<EmergencyAlert | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);

  const loadMembers = useCallback(async () => {
    if (!user?.familyGroupId) return;
    try {
      const result = await apiFetch<FamilyMember[]>('/family/members');
      setMembers(result);
    } catch {
      // Member list is supplementary; the live location feed still works without it.
    }
  }, [user?.familyGroupId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const memberById = useCallback(
    (id: string): FamilyMember | undefined => members.find((m) => m.id === id),
    [members]
  );

  const onLiveLocation = useCallback((event: LiveLocationEvent) => {
    setLiveLocations((prev) => ({ ...prev, [event.userId]: event }));
  }, []);

  useLocationSocket(onLiveLocation);

  const handleEmergencyNotification = useCallback((data: EmergencyNotificationData) => {
    if (!data.alertId) return;
    setActiveAlert({
      id: data.alertId,
      studentName: data.studentName ?? 'Student',
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
    });
  }, []);

  useNotificationTapHandler(handleEmergencyNotification);

  useEffect(() => {
    const lastResponse = Notifications.getLastNotificationResponse();
    const data = extractEmergencyData(lastResponse);
    if (data) handleEmergencyNotification(data);
    Notifications.clearLastNotificationResponse();
  }, [handleEmergencyNotification]);

  const acknowledge = async () => {
    if (!activeAlert) return;
    try {
      await apiFetch(`/alert/${activeAlert.id}/acknowledge`, { method: 'POST' });
      setActiveAlert(null);
    } catch (err) {
      Alert.alert('Could not acknowledge', err instanceof Error ? err.message : 'Please try again');
    }
  };

  const callEmergency = () => {
    Linking.openURL(`tel:${RESCUE_1122_NUMBER}`);
  };

  const liveLocationList = Object.values(liveLocations);
  const styles = makeStyles(theme);

  return (
    <View style={styles.container}>
      {/* Identity + status banner */}
      <View style={styles.banner}>
        <View style={styles.bannerStatus}>
          <View style={styles.bannerStatusDot} />
          <Text style={styles.bannerStatusText}>Signed in</Text>
        </View>
        <View style={styles.bannerPerson}>
          <View style={styles.avatar}>
            {user ? (
              <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
            ) : (
              <Text style={styles.avatarText}>?</Text>
            )}
          </View>
          <View style={styles.bannerTextBlock}>
            <Text style={styles.bannerName}>{user?.name}</Text>
            <Text style={styles.bannerRole}>{user?.role === 'parent' ? 'Parent / Guardian' : 'Student'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Family Dashboard</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.themeButton} onPress={toggleTheme}>
            <Text style={styles.themeButtonText}>{mode === 'dark' ? 'Light' : 'Dark'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('AlertHistory')}>
          <Text style={styles.navButtonText}>Alert History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('SafeZones')}>
          <Text style={styles.navButtonText}>Safe Zones</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('SchoolDetails')}>
          <Text style={styles.navButtonText}>School</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('AudioConsent')}>
          <Text style={styles.navButtonText}>Audio Consent</Text>
        </TouchableOpacity>
      </View>

      <MapView style={styles.map} region={KARACHI_REGION} customMapStyle={mapStyle}>
        {liveLocationList.map((loc) => {
          const member = memberById(loc.userId);
          const name = member?.name ?? 'Student';
          return (
            <Marker
              key={loc.userId}
              coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
              title={name}
              pinColor={c.beacon}
            >
              {member?.profile_picture_url ? (
                <View style={styles.markerAvatar}>
                  <Image source={{ uri: member.profile_picture_url }} style={styles.markerImage} />
                </View>
              ) : null}
            </Marker>
          );
        })}
      </MapView>

      {liveLocationList.length === 0 ? (
        <View style={styles.emptyStateBox}>
          <View style={styles.statusDot} />
          <Text style={styles.emptyState}>Waiting for a live location update</Text>
        </View>
      ) : (
        liveLocationList.map((loc) => {
          const member = memberById(loc.userId);
          const name = member?.name ?? 'Student';
          return (
            <View key={loc.userId} style={styles.locationCard}>
              <View style={styles.locationHeader}>
                <View style={styles.locationPerson}>
                  <View style={styles.avatarSmall}>
                    {member?.profile_picture_url ? (
                      <Image source={{ uri: member.profile_picture_url }} style={styles.markerImage} />
                    ) : (
                      <Text style={styles.avatarSmallText}>{name.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.locationName}>{name}</Text>
                </View>
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              </View>
              <Text style={styles.locationMeta}>Last seen {new Date(loc.recordedAt).toLocaleTimeString()}</Text>
              <Text style={styles.locationText}>
                {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
              </Text>
            </View>
          );
        })
      )}

      <Modal visible={activeAlert !== null} animationType="slide" transparent={false}>
        <View style={styles.emergencyOverlay}>
          <Text style={styles.emergencyTitle}>EMERGENCY ALERT</Text>
          <Text style={styles.emergencyName}>{activeAlert?.studentName}</Text>
          <Text style={styles.emergencyLocation}>
            {activeAlert ? `${activeAlert.latitude.toFixed(5)}, ${activeAlert.longitude.toFixed(5)}` : ''}
          </Text>

          <TouchableOpacity style={styles.callButton} onPress={callEmergency}>
            <Text style={styles.callButtonText}>Call Emergency (1122)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ackButton} onPress={acknowledge}>
            <Text style={styles.ackButtonText}>Acknowledge</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(t: Theme) {
  const c = t.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.ink, padding: spacing.lg, paddingTop: 60 },

    // Banner
    banner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    bannerStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    bannerStatusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.mint },
    bannerStatusText: { color: c.textMuted, fontWeight: '600', fontSize: 14 },
    bannerPerson: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.beacon,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: c.ink, fontWeight: '800', fontSize: 18 },
    bannerTextBlock: { alignItems: 'flex-end' },
    bannerName: { color: c.text, fontWeight: '700', fontSize: 16 },
    bannerRole: { color: c.textMuted, fontSize: 12 },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    title: { fontSize: 24, fontWeight: '800', color: c.text },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    themeButton: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    themeButtonText: { color: c.beaconSoft, fontWeight: '600', fontSize: 14 },
    logoutButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
    logoutText: { color: c.textMuted, fontWeight: '600', fontSize: 14 },

    navRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
    navButton: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    navButtonText: { color: c.beaconSoft, fontWeight: '600', fontSize: 13, textAlign: 'center' },

    map: { width: '100%', height: 220, borderRadius: radius.md, marginBottom: spacing.md },
    markerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: c.beacon,
      overflow: 'hidden',
      backgroundColor: c.surface,
    },
    markerImage: { width: '100%', height: '100%' },

    emptyStateBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.textFaint },
    emptyState: { color: c.textMuted, textAlign: 'center' },

    locationCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    locationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
    locationPerson: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avatarSmall: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.beacon,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarSmallText: { color: c.ink, fontWeight: '800', fontSize: 14 },
    locationName: { color: c.text, fontWeight: '700', fontSize: 15 },
    livePill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.mint },
    liveText: { color: c.mint, fontWeight: '700', fontSize: 12, letterSpacing: 1 },
    locationMeta: { color: c.textFaint, fontSize: 12, marginBottom: spacing.xs },
    locationText: { color: c.text, fontWeight: '600', fontSize: 14 },

    emergencyOverlay: { flex: 1, backgroundColor: c.danger, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
    emergencyTitle: { color: '#fff', fontSize: 32, fontWeight: '800', marginBottom: spacing.sm },
    emergencyName: { color: '#fff', fontSize: 22, fontWeight: '600', marginBottom: spacing.sm },
    emergencyLocation: { color: '#fff', fontSize: 16, marginBottom: spacing.xl },
    callButton: { backgroundColor: '#1c0a08', borderRadius: radius.md, paddingVertical: 16, paddingHorizontal: 40, marginBottom: spacing.md },
    callButtonText: { color: '#fff', fontWeight: '700', fontSize: 18 },
    ackButton: { backgroundColor: '#fff', borderRadius: radius.md, paddingVertical: 16, paddingHorizontal: 40 },
    ackButtonText: { color: c.danger, fontWeight: '700', fontSize: 18 },
  });
}
