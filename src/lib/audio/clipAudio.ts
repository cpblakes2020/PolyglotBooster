// Cuts any recording the browser can play (MP3, M4A, the sound of an MP4) into
// MP3 clips, in the browser. Unlike mp3Split's clips, which reuse an MP3's own
// frames, these are re-encoded, so they work whatever the file's format.

import { quietWindows, toBase64, type Clip } from "@/lib/audio/mp3Split";

// Anki's clips: one voice doesn't need more than mono at 64 kbps.
const sampleRate = 44100;
const bitrate = 64;
const encoderBlock = 1152;

export type DecodedRecording = { samples: Float32Array; duration: number; quiet: boolean[] };

// What counts as a pause depends on the recording: some have room echo or
// background sound between phrases that a fixed level would take for speech.
// So it's this far below the speech, taken as the level that only the loudest
// 10% of the recording reaches (in 50 ms steps).
const pauseBelowSpeech = 10 ** (-12 / 20);
const levelStep = 0.05;

function pauseLevel(samples: Float32Array) {
  const size = Math.round(sampleRate * levelStep);
  const levels: number[] = [];
  for (let start = 0; start + size <= samples.length; start += size) {
    let total = 0;
    for (let i = start; i < start + size; i++) total += samples[i] * samples[i];
    levels.push(Math.sqrt(total / size));
  }
  levels.sort((a, b) => a - b);
  return (levels[Math.floor(levels.length * 0.9)] ?? 0) * pauseBelowSpeech;
}

export async function decodeRecording(file: File): Promise<DecodedRecording> {
  // An offline context, because it decodes at the rate asked for, not the sound card's.
  const context = new OfflineAudioContext(1, 1, sampleRate);
  let audio: AudioBuffer;
  try {
    audio = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(`The sound in ${file.name} couldn't be read. Try an MP3 or M4A file.`);
  }
  const samples = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const data = audio.getChannelData(channel);
    for (let i = 0; i < audio.length; i++) samples[i] += data[i] / audio.numberOfChannels;
  }
  return { samples, duration: audio.duration, quiet: quietWindows(audio, pauseLevel(samples)) };
}

// Base64 MP3s, one after the other, as one: an MP3 is a run of frames, so
// they can simply be put end to end.
export function joinMp3s(parts: string[]) {
  const decoded = parts.map((part) => Uint8Array.from(atob(part), (char) => char.charCodeAt(0)));
  const bytes = new Uint8Array(decoded.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of decoded) {
    bytes.set(part, at);
    at += part.length;
  }
  return toBase64(bytes);
}

// The clip as an MP3, base64-encoded.
export async function encodeClip(recording: DecodedRecording, clip: Clip) {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(1, sampleRate, bitrate);
  const part = recording.samples.subarray(Math.floor(clip.start * sampleRate), Math.ceil(clip.end * sampleRate));
  const pcm = new Int16Array(part.length);
  for (let i = 0; i < part.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(part[i] * 32767)));
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < pcm.length; start += encoderBlock) chunks.push(encoder.encodeBuffer(pcm.subarray(start, start + encoderBlock)));
  chunks.push(encoder.flush());
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return toBase64(bytes);
}
