import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from './types';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import FamilySetupScreen from '../screens/FamilySetupScreen';
import AudioConsentScreen from '../screens/AudioConsentScreen';
import StudentHomeScreen from '../screens/StudentHomeScreen';
import ParentDashboardScreen from '../screens/ParentDashboardScreen';
import AlertHistoryScreen from '../screens/AlertHistoryScreen';
import SafeZonesScreen from '../screens/SafeZonesScreen';
import SchoolDetailsScreen from '../screens/SchoolDetailsScreen';
import { usePushRegistration } from '../hooks/usePushRegistration';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();

  // Register the device push token with the backend once signed in, so FCM alerts
  // (SOS/Crash/geofence) have a real delivery target on this device.
  usePushRegistration(Boolean(user));

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.ink }}>
        <ActivityIndicator size="large" color={theme.colors.beacon} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : !user.familyGroupId ? (
          <Stack.Screen name="FamilySetup" component={FamilySetupScreen} />
        ) : user.role === 'student' ? (
          <>
            <Stack.Screen name="StudentHome" component={StudentHomeScreen} />
            <Stack.Screen name="AudioConsent" component={AudioConsentScreen} />
            <Stack.Screen name="SchoolDetails" component={SchoolDetailsScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="ParentDashboard" component={ParentDashboardScreen} />
            <Stack.Screen name="AudioConsent" component={AudioConsentScreen} />
            <Stack.Screen name="AlertHistory" component={AlertHistoryScreen} />
            <Stack.Screen name="SafeZones" component={SafeZonesScreen} />
            <Stack.Screen name="SchoolDetails" component={SchoolDetailsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
