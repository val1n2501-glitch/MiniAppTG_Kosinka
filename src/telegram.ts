type Insets = { top: number; bottom: number; left: number; right: number };
type TelegramApp = {
  initData: string;
  colorScheme: string;
  viewportHeight: number;
  viewportStableHeight: number;
  version?: string;
  platform?: string;
  isExpanded?: boolean;
  isFullscreen?: boolean;
  isVerticalSwipesEnabled?: boolean;
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
  requestFullscreen?(): void;
  setBottomBarColor?(color: string): void;
  openTelegramLink?(url: string): void;
  onEvent(name: string, cb: (payload?: unknown) => void): void;
  offEvent(name: string, cb: (payload?: unknown) => void): void;
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

export function ensureTelegramImmersive() {
  const app = window.Telegram?.WebApp;
  if (!app) return;
  try {
    app.expand();
    lockTelegramGestures();
    if (app.isVersionAtLeast("8.0") && !app.isFullscreen)
      app.requestFullscreen?.();
  } catch {
    // expand() remains the fallback when fullscreen is unavailable.
  }
}

export function initTelegram() {
  const app = window.Telegram?.WebApp;
  if (!app) return () => {};
  const root = document.documentElement;
  const sync = () => {
    lockTelegramGestures();
    const height = Math.round(
      app.viewportHeight || app.viewportStableHeight || window.innerHeight,
    );
    root.dataset.telegram = "true";
    root.dataset.theme = app.colorScheme;
    root.dataset.fullscreen = String(Boolean(app.isFullscreen));
    root.dataset.verticalSwipes = String(app.isVerticalSwipesEnabled ?? false);
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
        `${Math.max(app.safeAreaInset?.[edge] || 0, app.contentSafeAreaInset?.[edge] || 0)}px`,
      );
  };
  const onFullscreenChanged = () => {
    delete root.dataset.fullscreenError;
    sync();
  };
  const onFullscreenFailed = (payload?: unknown) => {
    const error =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "unknown";
    root.dataset.fullscreenError = error;
    sync();
  };
  const onActivated = () => {
    ensureTelegramImmersive();
    sync();
  };
  const events: Array<[string, (payload?: unknown) => void]> = [
    ["themeChanged", sync],
    ["viewportChanged", sync],
    ["safeAreaChanged", sync],
    ["contentSafeAreaChanged", sync],
    ["fullscreenChanged", onFullscreenChanged],
    ["fullscreenFailed", onFullscreenFailed],
    ["activated", onActivated],
  ];
  events.forEach(([name, handler]) => app.onEvent(name, handler));
  try {
    if (app.isVersionAtLeast("6.1")) app.setBackgroundColor("#0a352c");
    if (app.isVersionAtLeast("6.9")) app.setHeaderColor("#0a352c");
    else if (app.isVersionAtLeast("6.1")) app.setHeaderColor("bg_color");
    if (app.isVersionAtLeast("7.10")) app.setBottomBarColor?.("#0a352c");
  } catch {
    // Color customization must never stop launch initialization.
  }
  ensureTelegramImmersive();
  sync();
  app.ready();
  return () => events.forEach(([name, handler]) => app.offEvent(name, handler));
}

export function haptic(win = false) {
  const app = window.Telegram?.WebApp;
  if (!app?.initData || !app.isVersionAtLeast("6.1")) return;
  if (win) app.HapticFeedback?.notificationOccurred("success");
  else app.HapticFeedback?.impactOccurred("light");
}
