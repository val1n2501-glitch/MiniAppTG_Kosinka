type Insets = { top: number; bottom: number; left: number; right: number };
type TelegramApp = {
  initData: string;
  colorScheme: string;
  viewportHeight: number;
  viewportStableHeight: number;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  themeParams: {
    button_color?: string;
    bg_color?: string;
    text_color?: string;
  };
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  disableVerticalSwipes?(): void;
  openTelegramLink?(url: string): void;
  onEvent(name: string, cb: () => void): void;
  offEvent(name: string, cb: () => void): void;
  HapticFeedback?: {
    impactOccurred(style: string): void;
    notificationOccurred(type: string): void;
  };
};
declare global {
  interface Window {
    Telegram?: { WebApp: TelegramApp };
  }
}
export function lockTelegramGestures() {
  const app = window.Telegram?.WebApp;
  try {
    app?.disableVerticalSwipes?.();
  } catch {
    // Older clients can expose an incomplete API.
  }
}

export function initTelegram() {
  const app = window.Telegram?.WebApp;
  if (!app) return () => {};
  const sync = () => {
    lockTelegramGestures();
    const root = document.documentElement;
    const height = Math.round(
      app.viewportStableHeight || app.viewportHeight || window.innerHeight,
    );
    root.dataset.telegram = "true";
    root.dataset.theme = app.colorScheme;
    if (root.style.getPropertyValue("--app-height") !== `${height}px`)
      root.style.setProperty("--app-height", `${height}px`);
    root.style.setProperty(
      "--dialog-bg",
      app.themeParams.bg_color || "#f7f8f5",
    );
    root.style.setProperty(
      "--dialog-text",
      app.themeParams.text_color || "#173e32",
    );
    for (const edge of ["top", "bottom", "left", "right"] as const)
      root.style.setProperty(
        `--safe-${edge}`,
        `${(app.safeAreaInset?.[edge] || 0) + (app.contentSafeAreaInset?.[edge] || 0)}px`,
      );
  };
  app.ready();
  app.expand();
  lockTelegramGestures();
  if (app.isVersionAtLeast("6.1")) {
    app.setBackgroundColor("#103f33");
    app.setHeaderColor("#103f33");
  }
  const events = [
    "themeChanged",
    "viewportChanged",
    "safeAreaChanged",
    "contentSafeAreaChanged",
  ];
  events.forEach((e) => app.onEvent(e, sync));
  sync();
  return () => events.forEach((e) => app.offEvent(e, sync));
}
export function haptic(win = false) {
  const app = window.Telegram?.WebApp;
  if (!app?.initData || !app.isVersionAtLeast("6.1")) return;
  if (win) app.HapticFeedback?.notificationOccurred("success");
  else app.HapticFeedback?.impactOccurred("light");
}
