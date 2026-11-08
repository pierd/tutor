import { useSyncExternalStore } from "react";

// App-wide audio player: only one clip plays at a time. Each caller passes an
// `owner` id so the control that started a clip can show pause/stop for it.

type State = { owner: string | null; playing: boolean };

let audio: HTMLAudioElement | null = null;
let state: State = { owner: null, playing: false };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function playAudio(url: string, { owner, rate = 1 }: { owner: string; rate?: number }) {
  stopAudio();
  const clip = new Audio(url);
  clip.preservesPitch = true;
  clip.playbackRate = rate;
  clip.onplay = () => audio === clip && set({ owner, playing: true });
  clip.onpause = () => audio === clip && set({ owner, playing: false });
  clip.onended = () => audio === clip && stopAudio();
  audio = clip;
  set({ owner, playing: true });
  void clip.play().catch(() => audio === clip && stopAudio());
}

export function pauseAudio() {
  audio?.pause();
}

export function resumeAudio() {
  void audio?.play();
}

export function rewindAudio(seconds = 5) {
  if (audio) audio.currentTime = Math.max(0, audio.currentTime - seconds);
}

export function stopAudio() {
  if (audio) {
    const clip = audio;
    audio = null;
    clip.pause();
  }
  if (state.owner !== null) set({ owner: null, playing: false });
}

export function currentAudioOwner() {
  return state.owner;
}

export function useAudioState() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
