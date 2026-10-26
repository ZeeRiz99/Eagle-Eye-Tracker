// Free map: Leaflet + OpenStreetMap tiles inside a WebView. No API key and no billing account (Google Maps on
// Android needs both; CARTO basemaps now need a key too, found by the CI screenshots). The OSM tile policy asks for
// attribution and an identifying User-Agent, both set here; heavy production traffic should use a tile provider.
// Dark mode darkens the tiles with a CSS filter. Also runs in Expo Go (react-native-webview ships with it).
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export type LatLng = { latitude: number; longitude: number };
export type MapPin = LatLng & { id: string; title?: string; color: string };

type Props = {
  center: LatLng;
  /** Span of the visible area in degrees, like react-native-maps' latitudeDelta. */
  delta: number;
  pins?: MapPin[];
  dark?: boolean;
  onPress?: (coordinate: LatLng) => void;
  style?: StyleProp<ViewStyle>;
};

/** latitudeDelta -> Leaflet zoom level (0.08 ≈ city, 0.005 ≈ street). */
export function zoomForDelta(delta: number): number {
  return Math.max(3, Math.min(18, Math.round(Math.log2(360 / Math.max(delta, 0.0005)))));
}

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';
// OSM tile policy: identify the app (https://operations.osmfoundation.org/policies/tiles/)
const USER_AGENT = 'EagleEyeTracker/1.0 (+https://github.com/ZeeRiz99/Eagle-Eye-Tracker)';

function html(dark: boolean): string {
  const bg = dark ? '#0E1320' : '#E9ECF1';
  const tileFilter = dark ? 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9)' : 'none';
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css">
<style>html,body,#map{height:100%;margin:0;background:${bg}}.leaflet-control-attribution{font-size:9px}
.leaflet-tile-pane{filter:${tileFilter}}</style>
</head><body><div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var last = '';
  window.applyState = function (s) {
    var key = s.lat + ',' + s.lng + ',' + s.zoom;
    if (key !== last) { map.setView([s.lat, s.lng], s.zoom); last = key; }
    layer.clearLayers();
    s.pins.forEach(function (p) {
      var m = L.circleMarker([p.latitude, p.longitude], {
        radius: 9, color: '#FFFFFF', weight: 3, fillColor: p.color, fillOpacity: 1
      }).addTo(layer);
      if (p.title) m.bindTooltip(p.title, { permanent: true, direction: 'top', offset: [0, -10] });
    });
  };
  map.on('click', function (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'press', lat: e.latlng.lat, lng: e.latlng.lng }));
  });
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
</script></body></html>`;
}

export default function OsmMap({ center, delta, pins = [], dark = true, onPress, style }: Props) {
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const source = useMemo(() => ({ html: html(dark), baseUrl: 'https://eagle-eye-tracker.local/' }), [dark]);
  const state = JSON.stringify({ lat: center.latitude, lng: center.longitude, zoom: zoomForDelta(delta), pins });

  const push = () => web.current?.injectJavaScript(`window.applyState && window.applyState(${state}); true;`);

  useEffect(() => {
    if (ready.current) push();
    // state is the serialised props; pushing again only when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const onMessage = (event: WebViewMessageEvent) => {
    const msg = JSON.parse(event.nativeEvent.data);
    if (msg.type === 'ready') {
      ready.current = true;
      push();
    } else if (msg.type === 'press' && onPress) {
      onPress({ latitude: msg.lat, longitude: msg.lng });
    }
  };

  return (
    <WebView
      ref={web}
      style={style}
      source={source}
      originWhitelist={['*']}
      userAgent={USER_AGENT}
      onMessage={onMessage}
      onLoadStart={() => { ready.current = false; }}
      javaScriptEnabled
      scrollEnabled={false}
      overScrollMode="never"
      setBuiltInZoomControls={false}
      accessibilityLabel="Map"
    />
  );
}
