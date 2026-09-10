export type SoundName =
  "draw" | "move" | "flip" | "invalid" | "new" | "undo" | "win";

let context: AudioContext | null = null;

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function getContext() {
  if (context) return context;
  const AudioContextClass =
    window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextClass) return null;
  context = new AudioContextClass({ latencyHint: "interactive" });
  return context;
}

function tone(
  audio: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

function schedule(name: SoundName, audio: AudioContext) {
  const now = audio.currentTime + 0.008;
  if (name === "draw") tone(audio, 230, now, 0.065, 0.055, "triangle");
  if (name === "move") tone(audio, 330, now, 0.075, 0.06, "sine");
  if (name === "flip") {
    tone(audio, 280, now, 0.06, 0.048, "triangle");
    tone(audio, 410, now + 0.038, 0.06, 0.04, "triangle");
  }
  if (name === "undo") tone(audio, 260, now, 0.085, 0.05, "sine");
  if (name === "invalid") tone(audio, 135, now, 0.11, 0.042, "square");
  if (name === "new")
    [294, 370, 440].forEach((frequency, index) =>
      tone(audio, frequency, now + index * 0.05, 0.12, 0.05, "triangle"),
    );
  if (name === "win")
    [392, 494, 587, 784].forEach((frequency, index) =>
      tone(audio, frequency, now + index * 0.09, 0.23, 0.07, "sine"),
    );
}

export function playSound(name: SoundName, enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const audio = getContext();
    if (!audio) return;
    if (audio.state !== "running") {
      void audio
        .resume()
        .then(() => schedule(name, audio))
        .catch(() => {});
      return;
    }
    schedule(name, audio);
  } catch {
    // Web Audio may be unavailable in an embedded browser.
  }
}
