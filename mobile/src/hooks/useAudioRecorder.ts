import { useRef, useState } from 'react';
import { Audio } from 'expo-av';

const MAX_RECORDING_MS = 30_000;

export interface RecordingResult {
  uri: string;
  durationMs: number;
}

// Records up to 30 seconds of ambient audio on-device, per spec §2 (SOS/Crash
// only, consent-gated). Returns the local file URI; uploading to object storage
// and passing the resulting URL as alert.audioUrl is a follow-up once S3 creds exist.
export function useAudioRecorder() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = async (): Promise<void> => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Microphone permission not granted');
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();
    recordingRef.current = recording;
    setIsRecording(true);

    // Hard stop at 30s so a runaway recording never exceeds the consent scope.
    setTimeout(() => {
      if (recordingRef.current) void stopRecording();
    }, MAX_RECORDING_MS);
  };

  const stopRecording = async (): Promise<RecordingResult | null> => {
    const recording = recordingRef.current;
    if (!recording) return null;
    recordingRef.current = null;
    setIsRecording(false);

    await recording.stopAndUnloadAsync();
    return { uri: recording.getURI() ?? '', durationMs: MAX_RECORDING_MS };
  };

  return { startRecording, stopRecording, isRecording };
}
