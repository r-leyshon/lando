let context: AudioContext | null = null;
let muted = false;

function ctx() {
  if (typeof window === "undefined") return null;
  if (!context) context = new AudioContext();
  return context;
}

export function setMuted(next: boolean) {
  muted = next;
}

export function unlockAudio() {
  const audio = ctx();
  if (audio?.state === "suspended") void audio.resume();
}

function buzz(ms: number) {
  if (muted || typeof navigator === "undefined" || !navigator.vibrate) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate(ms);
}

function tone(frequency: number, at: number, duration: number, type: OscillatorType, gain = 0.08) {
  const audio = ctx();
  if (!audio || muted) return;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audio.currentTime + at);
  amp.gain.setValueAtTime(gain, audio.currentTime + at);
  amp.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + at + duration);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(audio.currentTime + at);
  osc.stop(audio.currentTime + at + duration);
}

export const sfx = {
  tap() {
    tone(520, 0, 0.06, "triangle", 0.04);
  },
  correct() {
    tone(523, 0, 0.12, "triangle", 0.07);
    tone(659, 0.08, 0.12, "triangle", 0.07);
    tone(784, 0.16, 0.18, "triangle", 0.07);
    buzz(16);
  },
  fanfare() {
    tone(523, 0, 0.1, "square", 0.05);
    tone(659, 0.1, 0.1, "square", 0.05);
    tone(784, 0.2, 0.1, "square", 0.05);
    tone(1046, 0.3, 0.22, "square", 0.05);
    buzz(24);
  },
  near() {
    tone(440, 0, 0.08, "sine", 0.05);
    tone(494, 0.09, 0.1, "sine", 0.05);
  },
  miss() {
    tone(392, 0, 0.12, "sine", 0.06);
    tone(311, 0.1, 0.16, "sine", 0.05);
    buzz(10);
  },
};
