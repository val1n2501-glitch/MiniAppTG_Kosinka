import { afterEach, describe, expect, it, vi } from "vitest";

describe("звук", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("дожидается разблокировки AudioContext и только затем запускает звук", async () => {
    let starts = 0;
    let resumes = 0;

    class FakeAudioContext {
      state: AudioContextState = "suspended";
      currentTime = 1;
      destination = {};

      async resume() {
        resumes++;
        this.state = "running";
      }

      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime() {} },
          connect: (node: unknown) => node,
          start: () => starts++,
          stop() {},
        };
      }

      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect: (node: unknown) => node,
        };
      }
    }

    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const { playSound } = await import("../src/audio");

    playSound("move", true);
    expect(resumes).toBe(1);
    expect(starts).toBe(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(starts).toBe(1);
  });
});
