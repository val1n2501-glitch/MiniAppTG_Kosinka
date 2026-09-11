export type ShareOutcome =
  "telegram" | "native" | "clipboard" | "cancelled" | "manual";

const PRODUCTION_URL =
  "https://kosynka-miniapp-vk-20260910.valek2501.chatgpt.site/";

export function gameShareUrl() {
  const { origin, pathname, protocol, hostname } = window.location;
  return (protocol === "http:" || protocol === "https:") &&
    hostname !== "localhost" &&
    hostname !== "127.0.0.1"
    ? `${origin}${pathname}`
    : PRODUCTION_URL;
}

export async function shareResult(
  text: string,
  url: string,
): Promise<ShareOutcome> {
  const app = window.Telegram?.WebApp;
  if (app?.initData && app.openTelegramLink) {
    try {
      app.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      );
      return "telegram";
    } catch {
      // Continue with browser fallbacks.
    }
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Бархатная Косынка", text, url });
      return "native";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        return "cancelled";
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return "clipboard";
    }
  } catch {
    // The dialog will offer manual copying.
  }
  return "manual";
}
