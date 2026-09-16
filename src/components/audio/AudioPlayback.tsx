"use client";

import { useRef, useState } from "react";

type AudioPlaybackProps = {
  url: string;
  label?: string;
};

const backSeconds = [30, 10, 5];
const forwardSeconds = 10;

function SkipIcon({ direction, seconds }: { direction: "back" | "forward"; seconds: number }) {
  return (
    <span className="skip-icon" aria-hidden="true">
      <span className="skip-arrow">{direction === "back" ? "↺" : "↻"}</span>
      <span className="skip-number">{seconds}</span>
    </span>
  );
}

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

  function skip(deltaSeconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.min(Math.max(0, audio.currentTime + deltaSeconds), duration);
  }

  return (
    <span className="audio-playback" role="group" aria-label={label || "Audio playback"}>
      <audio ref={audioRef} src={url} preload="none" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} />
      {backSeconds.map((seconds) => (
        <button key={`back-${seconds}`} type="button" className="audio-skip-button" onClick={() => skip(-seconds)} aria-label={`Back ${seconds} seconds`} title={`Back ${seconds} seconds`}>
          <SkipIcon direction="back" seconds={seconds} />
        </button>
      ))}
      <button type="button" className="audio-play-button" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause" : "Play"}>{isPlaying ? "⏸" : "▶"}</button>
      <button type="button" className={`audio-loop-button${isLooping ? " active" : ""}`} onClick={toggleLoop} aria-label={isLooping ? "Turn off loop" : "Loop playback"} title={isLooping ? "Turn off loop" : "Loop playback"}>🔁</button>
      <button type="button" className="audio-skip-button" onClick={() => skip(forwardSeconds)} aria-label={`Forward ${forwardSeconds} seconds`} title={`Forward ${forwardSeconds} seconds`}>
        <SkipIcon direction="forward" seconds={forwardSeconds} />
      </button>
    </span>
  );
}
