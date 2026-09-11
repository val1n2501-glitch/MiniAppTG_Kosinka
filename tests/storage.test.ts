import { beforeEach, describe, expect, it } from "vitest";
import { newGame } from "../src/game";
import {
  defaultSettings,
  emptyStatistics,
  GAME_KEY,
  loadGame,
  loadOnboardingSeen,
  loadSettings,
  loadStatistics,
  ONBOARDING_KEY,
  recordFinishedGame,
  saveGame,
  saveOnboardingSeen,
  saveSettings,
  saveStatistics,
  SETTINGS_KEY,
  STATISTICS_KEY,
  winRate,
} from "../src/storage";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
});

describe("локальное хранилище", () => {
  it("сохраняет и восстанавливает партию", () => {
    const game = { ...newGame(3, 555), elapsed: 64, undos: 2 };
    expect(saveGame(game)).toBe(true);
    expect(loadGame()).toEqual(game);
  });

  it("игнорирует повреждённую партию", () => {
    localStorage.setItem(GAME_KEY, "{broken");
    expect(loadGame()).toBeNull();
  });

  it("валидирует настройки и заполняет отсутствующие значения", () => {
    expect(loadSettings()).toEqual(defaultSettings);
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ draw: 3, sound: false, animations: false }),
    );
    expect(loadSettings()).toEqual({
      draw: 3,
      sound: false,
      animations: false,
      doubleTap: true,
      autoComplete: true,
    });
    const settings = { ...defaultSettings, doubleTap: false };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it("запоминает завершение первого обучения", () => {
    expect(loadOnboardingSeen()).toBe(false);
    saveOnboardingSeen();
    expect(localStorage.getItem(ONBOARDING_KEY)).toBe("1");
    expect(loadOnboardingSeen()).toBe(true);
  });

  it("сохраняет статистику отдельно для Draw 1 и Draw 3", () => {
    let statistics = emptyStatistics();
    const draw1 = {
      ...newGame(1, 1),
      elapsed: 90,
      board: { ...newGame(1, 1).board, moves: 120 },
    };
    const draw3 = {
      ...newGame(3, 2),
      elapsed: 150,
      board: { ...newGame(3, 2).board, moves: 140 },
    };
    statistics = recordFinishedGame(statistics, draw1, "win");
    statistics = recordFinishedGame(statistics, draw3, "abandoned");
    saveStatistics(statistics);
    const restored = loadStatistics();
    expect(restored.draw1).toMatchObject({
      played: 1,
      wins: 1,
      bestTime: 90,
      minMoves: 120,
      currentStreak: 1,
    });
    expect(restored.draw3).toMatchObject({
      played: 1,
      abandoned: 1,
      totalTime: 150,
      currentStreak: 0,
    });
    expect(winRate(restored.draw1)).toBe(100);
  });

  it("обновляет лучшую серию, лучшее время и минимум ходов", () => {
    let statistics = emptyStatistics();
    const first = {
      ...newGame(1, 3),
      elapsed: 100,
      board: { ...newGame(1, 3).board, moves: 130 },
    };
    const second = {
      ...newGame(1, 4),
      elapsed: 80,
      board: { ...newGame(1, 4).board, moves: 110 },
    };
    statistics = recordFinishedGame(statistics, first, "win");
    statistics = recordFinishedGame(statistics, second, "win");
    expect(statistics.draw1).toMatchObject({
      currentStreak: 2,
      bestStreak: 2,
      bestTime: 80,
      minMoves: 110,
    });
    statistics = recordFinishedGame(statistics, first, "abandoned");
    expect(statistics.draw1.currentStreak).toBe(0);
    expect(statistics.draw1.bestStreak).toBe(2);
  });

  it("отбрасывает логически повреждённую статистику", () => {
    localStorage.setItem(
      STATISTICS_KEY,
      JSON.stringify({ version: 1, draw1: { played: -1 }, draw3: {} }),
    );
    expect(loadStatistics()).toEqual(emptyStatistics());
  });
});
