"use client";

import { useRef, useState } from "react";

type AudioPlaybackProps = {
  url: string;
  label?: string;
};

export function AudioPlayback({ url, label }: AudioPlaybackProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isLooping, setIsLooping] = useState(false);

  function playOnce() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = false;
    setIsLooping(false);
    audio.currentTime = 0;
    void audio.play();
  }

  function toggleLoop() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isLooping) {
      audio.pause();
      audio.loop = false;
      setIsLooping(false);
      return;
    }
    audio.loop = true;
    setIsLooping(true);
    audio.currentTime = 0;
    void audio.play();
  }

  return (
    <span className="audio-playback" role="group" aria-label={label || "Audio playback"}>
      <audio ref={audioRef} src={url} preload="none" onEnded={() => setIsLooping(false)} />
      <button type="button" className="audio-play-button" onClick={playOnce} aria-label="Play once" title="Play once">▶</button>
      <button type="button" className={`audio-loop-button${isLooping ? " active" : ""}`} onClick={toggleLoop} aria-label={isLooping ? "Stop loop playback" : "Loop playback"} title={isLooping ? "Stop loop" : "Loop playback"}>🔁</button>
    </span>
  );
}
