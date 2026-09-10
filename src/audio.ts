export type SoundName =
  "draw" | "move" | "flip" | "invalid" | "new" | "undo" | "win";

let context: AudioContext | null = null;

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

export function playSound(name: SoundName, enabled: boolean) {
  if (!enabled || typeof AudioContext === "undefined") return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    if (name === "draw") tone(context, 230, now, 0.055, 0.022, "triangle");
    if (name === "move") tone(context, 330, now, 0.07, 0.025, "sine");
    if (name === "flip") {
      tone(context, 280, now, 0.055, 0.018, "triangle");
      tone(context, 410, now + 0.035, 0.055, 0.014, "triangle");
    }
    if (name === "undo") tone(context, 260, now, 0.08, 0.018, "sine");
    if (name === "invalid") tone(context, 135, now, 0.1, 0.018, "square");
    if (name === "new")
      [294, 370, 440].forEach((frequency, index) =>
        tone(context!, frequency, now + index * 0.045, 0.11, 0.018, "triangle"),
      );
    if (name === "win")
      [392, 494, 587, 784].forEach((frequency, index) =>
        tone(context!, frequency, now + index * 0.09, 0.22, 0.025, "sine"),
      );
  } catch {
    // Web Audio may be blocked until a user gesture. Sound is optional.
  }
}
