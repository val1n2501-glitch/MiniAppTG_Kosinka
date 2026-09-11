import { restore, serialize, type Game } from "./game";

export const GAME_KEY = "kosynka.game.v2";
export const SETTINGS_KEY = "kosynka.settings.v1";
export const STATISTICS_KEY = "kosynka.statistics.v1";
export const ONBOARDING_KEY = "kosynka.onboarding.v1";

export type Settings = {
  draw: 1 | 3;
  sound: boolean;
  animations: boolean;
  doubleTap: boolean;
  autoComplete: boolean;
};

export type ModeStatistics = {
  played: number;
  wins: number;
  abandoned: number;
  currentStreak: number;
  bestStreak: number;
  bestTime: number | null;
  minMoves: number | null;
  totalTime: number;
};

export type Statistics = {
  version: 1;
  draw1: ModeStatistics;
  draw3: ModeStatistics;
};

export const defaultSettings: Settings = {
  draw: 1,
  sound: true,
  animations: true,
  doubleTap: true,
  autoComplete: true,
};

const emptyMode = (): ModeStatistics => ({
  played: 0,
  wins: 0,
  abandoned: 0,
  currentStreak: 0,
  bestStreak: 0,
  bestTime: null,
  minMoves: null,
  totalTime: 0,
});

export const emptyStatistics = (): Statistics => ({
  version: 1,
  draw1: emptyMode(),
  draw3: emptyMode(),
});

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadGame(): Game | null {
  try {
    return restore(localStorage.getItem(GAME_KEY));
  } catch {
    return null;
  }
}

export function saveGame(game: Game): boolean {
  try {
    localStorage.setItem(GAME_KEY, serialize(game));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): Settings {
  const value = readJson(SETTINGS_KEY) as Partial<Settings> | null;
  if (!value) return defaultSettings;
  return {
    draw: value.draw === 3 ? 3 : 1,
    sound: typeof value.sound === "boolean" ? value.sound : true,
    animations: typeof value.animations === "boolean" ? value.animations : true,
    doubleTap: typeof value.doubleTap === "boolean" ? value.doubleTap : true,
    autoComplete:
      typeof value.autoComplete === "boolean" ? value.autoComplete : true,
  };
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The game remains usable when storage is unavailable.
  }
}

export function loadOnboardingSeen(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveOnboardingSeen() {
  try {
    localStorage.setItem(ONBOARDING_KEY, "1");
  } catch {
    // Onboarding may reappear when storage is unavailable.
  }
}

function validMode(value: unknown): value is ModeStatistics {
  const mode = value as ModeStatistics;
  return (
    !!mode &&
    [
      mode.played,
      mode.wins,
      mode.abandoned,
      mode.currentStreak,
      mode.bestStreak,
      mode.totalTime,
    ].every((item) => Number.isSafeInteger(item) && item >= 0) &&
    (mode.bestTime === null ||
      (Number.isSafeInteger(mode.bestTime) && mode.bestTime >= 0)) &&
    (mode.minMoves === null ||
      (Number.isSafeInteger(mode.minMoves) && mode.minMoves >= 0)) &&
    mode.played === mode.wins + mode.abandoned &&
    mode.wins <= mode.played &&
    mode.currentStreak <= mode.bestStreak
  );
}

export function loadStatistics(): Statistics {
  const value = readJson(STATISTICS_KEY) as Statistics | null;
  return value?.version === 1 &&
    validMode(value.draw1) &&
    validMode(value.draw3)
    ? value
    : emptyStatistics();
}

export function saveStatistics(statistics: Statistics) {
  try {
    localStorage.setItem(STATISTICS_KEY, JSON.stringify(statistics));
  } catch {
    // Statistics are non-critical and remain in memory.
  }
}

export function recordFinishedGame(
  statistics: Statistics,
  game: Game,
  result: "win" | "abandoned",
): Statistics {
  const next = structuredClone(statistics);
  const mode = game.board.draw === 1 ? next.draw1 : next.draw3;
  mode.played++;
  mode.totalTime += game.elapsed;
  if (result === "win") {
    mode.wins++;
    mode.currentStreak++;
    mode.bestStreak = Math.max(mode.bestStreak, mode.currentStreak);
    mode.bestTime =
      mode.bestTime === null
        ? game.elapsed
        : Math.min(mode.bestTime, game.elapsed);
    mode.minMoves =
      mode.minMoves === null
        ? game.board.moves
        : Math.min(mode.minMoves, game.board.moves);
  } else {
    mode.abandoned++;
    mode.currentStreak = 0;
  }
  return next;
}

export const winRate = (mode: ModeStatistics) =>
  mode.played ? Math.round((mode.wins / mode.played) * 100) : 0;
