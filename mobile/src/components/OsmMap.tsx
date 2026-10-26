// Free map: Leaflet + OpenStreetMap data inside a WebView. No API key and no billing account
// (Google Maps on Android needs both). Tiles: CARTO basemaps, free for non-commercial use, attribution shown.
// Also runs in Expo Go, since react-native-webview ships with it.
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

function html(dark: boolean): string {
  const tiles = dark ? 'dark_all' : 'light_all';
  const bg = dark ? '#0E1320' : '#E9ECF1';
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css">
<style>html,body,#map{height:100%;margin:0;background:${bg}}.leaflet-control-attribution{font-size:9px}</style>
</head><body><div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/${tiles}/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
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
