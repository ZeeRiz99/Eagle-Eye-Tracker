// Eagle Eye Tracker — "night beacon" visual system with light + dark palettes.
// Amber is the brand beacon; red is reserved for genuine danger (SOS / crash).
// Light mode uses the same hue story on warm near-white surfaces.

export interface Theme {
  mode: 'dark' | 'light';
  colors: {
    ink: string;
    surface: string;
    surfaceRaised: string;
    border: string;

    beacon: string;
    beaconSoft: string;
    mint: string;
    danger: string;

    text: string;
    textMuted: string;
    textFaint: string;
  };
}

const dark: Theme = {
  mode: 'dark',
  colors: {
    ink: '#0E1320',
    surface: '#171E2E',
    surfaceRaised: '#1F2940',
    border: '#2A3450',

    beacon: '#FFB340',
    beaconSoft: '#FFC86B',
    mint: '#2ED59E',
    danger: '#FF3B30',

    text: '#F4F6FB',
    textMuted: '#8A93A6',
    textFaint: '#5B6478',
  },
};

const light: Theme = {
  mode: 'light',
  colors: {
    ink: '#F6F3EC',
    surface: '#FFFFFF',
    surfaceRaised: '#FDF8EE',
    border: '#E4DCC9',

    beacon: '#C97A12',
    beaconSoft: '#A8640C',
    mint: '#0F9E73',
    danger: '#D9261C',

    text: '#17130C',
    textMuted: '#5A5448',
    textFaint: '#8A8374',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 36,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 22,
  pill: 999,
};

export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#171E2E' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A93A6' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0E1320' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#22304a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0E1320' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1b2a41' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#10182b' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5B6478' }] },
];

export const lightMapStyle: typeof darkMapStyle = [];

export const themes = { dark, light };
