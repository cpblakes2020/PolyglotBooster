"use client";

import { useRef, useState } from "react";

type AudioPlaybackProps = {
  url: string;
  label?: string;
};

const rewindSeconds = 5;

export function AudioPlayback({ url, label }: AudioPlaybackProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function toggleLoop() {
    const audio = audioRef.current;
    if (!audio) return;
    const next = !isLooping;
    audio.loop = next;
    setIsLooping(next);
    if (next && audio.paused) void audio.play();
  }

  function rewind() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime - rewindSeconds);
  }

  return (
    <span className="audio-playback" role="group" aria-label={label || "Audio playback"}>
      <audio ref={audioRef} src={url} preload="none" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} />
      <button type="button" className="audio-rewind-button" onClick={rewind} aria-label="Rewind 5 seconds" title="Rewind 5 seconds">⏪</button>
      <button type="button" className="audio-play-button" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause" : "Play"}>{isPlaying ? "⏸" : "▶"}</button>
      <button type="button" className={`audio-loop-button${isLooping ? " active" : ""}`} onClick={toggleLoop} aria-label={isLooping ? "Turn off loop" : "Loop playback"} title={isLooping ? "Turn off loop" : "Loop playback"}>🔁</button>
    </span>
  );
}
