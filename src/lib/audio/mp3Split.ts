// Splits a textbook's MP3 recording into one clip per sentence, in the
// browser. Sentences are found from long pauses in the decoded audio; the
// clips are cut from the original MP3 frames, so nothing is re-encoded.

type Frame = { offset: number; length: number; start: number; duration: number };

export type Mp3Analysis = {
  bytes: Uint8Array;
  frames: Frame[];
  duration: number;
  // One flag per window: true when the audio is quiet.
  quiet: boolean[];
};

export type Clip = { start: number; end: number };

const windowSeconds = 0.01;
// About -35 dB: quieter than this counts as silence.
const quietPeak = 0.018;
const shortestSound = 0.3;
const leadSeconds = 0.25;
const tailSeconds = 0.4;

// Gaps at least this long separate sentences; shorter pauses stay inside one.
export const defaultSentenceGap = 1.0;

const mpeg1Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const mpeg2Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const mpeg1SampleRates = [44100, 48000, 32000];

// A Layer III frame header at offset, or null.
function frameAt(bytes: Uint8Array, offset: number) {
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return null;
  const version = (bytes[offset + 1] >> 3) & 3; // 3 MPEG-1, 2 MPEG-2, 0 MPEG-2.5
  const layer = (bytes[offset + 1] >> 1) & 3;
  const bitrateIndex = bytes[offset + 2] >> 4;
  const rateIndex = (bytes[offset + 2] >> 2) & 3;
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const mpeg1 = version === 3;
  const bitrate = (mpeg1 ? mpeg1Bitrates : mpeg2Bitrates)[bitrateIndex] * 1000;
  const sampleRate = mpeg1SampleRates[rateIndex] / (mpeg1 ? 1 : version === 2 ? 2 : 4);
  const padding = (bytes[offset + 2] >> 1) & 1;
  const length = Math.floor(((mpeg1 ? 144 : 72) * bitrate) / sampleRate) + padding;
  return { length, duration: (mpeg1 ? 1152 : 576) / sampleRate };
}

function id3Length(bytes: Uint8Array) {
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
  return 10 + size + (bytes[5] & 0x10 ? 10 : 0);
}

// A Xing/Info frame only describes the file; a slice mustn't keep it.
function isInfoFrame(bytes: Uint8Array, frame: Frame) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(frame.offset, frame.offset + Math.min(frame.length, 64)));
  return head.includes("Xing") || head.includes("Info");
}

function parseFrames(bytes: Uint8Array) {
  const frames: Frame[] = [];
  let time = 0;
  let offset = id3Length(bytes);
  while (offset < bytes.length) {
    const frame = frameAt(bytes, offset);
    // A real header is followed by another one (or the end of the file);
    // anything else (junk, zero padding, an ID3v1 tag) is skipped.
    if (frame && (offset + frame.length >= bytes.length || frameAt(bytes, offset + frame.length))) {
      frames.push({ offset, length: frame.length, start: time, duration: frame.duration });
      time += frame.duration;
      offset += frame.length;
    } else {
      offset += 1;
    }
  }
  if (frames.length && isInfoFrame(bytes, frames[0])) {
    const shift = frames[0].duration;
    frames.shift();
    for (const frame of frames) frame.start -= shift;
  }
  return frames;
}

function joinFrames(bytes: Uint8Array, frames: Frame[]) {
  const out = new Uint8Array(frames.reduce((total, frame) => total + frame.length, 0));
  let at = 0;
  for (const frame of frames) {
    out.set(bytes.subarray(frame.offset, frame.offset + frame.length), at);
    at += frame.length;
  }
  return out;
}

export async function analyzeMp3(file: File): Promise<Mp3Analysis> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const frames = parseFrames(bytes);
  if (!frames.length) throw new Error(`${file.name} isn't an MP3 file this page can split.`);
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(joinFrames(bytes, frames).buffer);
    const size = Math.round(audio.sampleRate * windowSeconds);
    const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));
    const quiet: boolean[] = [];
    for (let start = 0; start < audio.length; start += size) {
      let peak = 0;
      for (const data of channels) {
        for (let i = start; i < Math.min(start + size, audio.length); i++) peak = Math.max(peak, Math.abs(data[i]));
      }
      quiet.push(peak < quietPeak);
    }
    const last = frames[frames.length - 1];
    return { bytes, frames, duration: last.start + last.duration, quiet };
  } finally {
    void context.close();
  }
}

// The sentences in a recording: the sounds between gaps of at least
// sentenceGap seconds, with a little room on each side.
export function findClips(analysis: Mp3Analysis, sentenceGap = defaultSentenceGap): Clip[] {
  const sounds: Clip[] = [];
  let soundStart = -1;
  let quietRun = 0;
  const gapWindows = Math.round(sentenceGap / windowSeconds);
  analysis.quiet.forEach((quiet, index) => {
    if (!quiet) {
      if (soundStart < 0) soundStart = index;
      quietRun = 0;
      return;
    }
    quietRun += 1;
    if (soundStart >= 0 && quietRun === gapWindows) {
      sounds.push({ start: soundStart * windowSeconds, end: (index - quietRun + 1) * windowSeconds });
      soundStart = -1;
    }
  });
  if (soundStart >= 0) sounds.push({ start: soundStart * windowSeconds, end: (analysis.quiet.length - quietRun) * windowSeconds });
  return sounds
    .filter((sound) => sound.end - sound.start >= shortestSound)
    .map((sound) => ({ start: Math.max(0, sound.start - leadSeconds), end: Math.min(analysis.duration, sound.end + tailSeconds) }));
}

// The clip as MP3 bytes: the original frames that overlap it.
export function clipBytes(analysis: Mp3Analysis, clip: Clip) {
  return joinFrames(analysis.bytes, analysis.frames.filter((frame) => frame.start + frame.duration > clip.start && frame.start < clip.end));
}

export function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}
