import { beforeEach, describe, expect, it, vi } from "vitest";
import { shareResult } from "../src/share";

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: { Telegram: undefined },
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: {},
    configurable: true,
  });
});

describe("публикация результата", () => {
  it("использует Telegram share внутри Mini App", async () => {
    const openTelegramLink = vi.fn();
    window.Telegram = {
      WebApp: { initData: "signed", openTelegramLink },
    } as never;
    expect(await shareResult("Результат", "https://example.com/")).toBe(
      "telegram",
    );
    expect(openTelegramLink).toHaveBeenCalledWith(
      expect.stringContaining("https://t.me/share/url"),
    );
  });

  it("использует системный share в браузере", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share });
    expect(await shareResult("Результат", "https://example.com/")).toBe(
      "native",
    );
    expect(share).toHaveBeenCalledWith({
      title: "Бархатная Косынка",
      text: "Результат",
      url: "https://example.com/",
    });
  });

  it("копирует текст, если системный share недоступен", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText } });
    expect(await shareResult("Результат", "https://example.com/")).toBe(
      "clipboard",
    );
    expect(writeText).toHaveBeenCalledWith("Результат\nhttps://example.com/");
  });
});
