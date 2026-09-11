import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  BarChart3,
  Check,
  Lightbulb,
  MousePointerClick,
  RotateCcw,
  Settings as SettingsIcon,
  Share2,
  Sparkles,
  Trophy,
  Undo2,
  X,
} from "lucide-react";
import type { Game } from "../game";
import { gameShareUrl, shareResult } from "../share";
import {
  emptyStatistics,
  winRate,
  type Settings,
  type Statistics,
} from "../storage";

export type ModalKind =
  "new" | "settings" | "statistics" | "rules" | "onboarding" | "victory" | null;

type DialogsProps = {
  modal: ModalKind;
  game: Game;
  settings: Settings;
  statistics: Statistics;
  onClose: () => void;
  onSettings: (settings: Settings) => void;
  onNewGame: (sameDeal: boolean) => void;
  onResetStatistics: (statistics: Statistics) => void;
  onOpenOnboarding: () => void;
  onOnboardingDone: () => void;
};

const formatTime = (seconds: number | null) =>
  seconds === null
    ? "—"
    : `${Math.floor(seconds / 60)
        .toString()
        .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

export function GameDialog({
  modal,
  game,
  settings,
  statistics,
  onClose,
  onSettings,
  onNewGame,
  onResetStatistics,
  onOpenOnboarding,
  onOnboardingDone,
}: DialogsProps) {
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    window.setTimeout(
      () =>
        cardRef.current?.querySelector<HTMLElement>("button, input")?.focus(),
      0,
    );
    return () => previous?.focus();
  }, [modal]);
  if (!modal) return null;
  const closeAllowed = modal !== "victory";
  const close = modal === "onboarding" ? onOnboardingDone : onClose;
  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const items = [
      ...(cardRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled)",
      ) ?? []),
    ];
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeAllowed) close();
      }}
    >
      <section
        ref={cardRef}
        className={`modal-card modal-${modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onKeyDown={trapFocus}
      >
        {closeAllowed && (
          <button
            className="modal-close"
            aria-label="Закрыть"
            title="Закрыть"
            onClick={close}
          >
            <X />
          </button>
        )}
        {modal === "new" && (
          <NewGame game={game} onClose={onClose} onStart={onNewGame} />
        )}
        {modal === "settings" && (
          <SettingsDialog
            settings={settings}
            currentDraw={game.board.draw}
            onChange={onSettings}
            onClose={onClose}
            onStart={() => onNewGame(false)}
          />
        )}
        {modal === "statistics" && (
          <StatisticsDialog
            statistics={statistics}
            onReset={onResetStatistics}
          />
        )}
        {modal === "rules" && (
          <RulesDialog onClose={onClose} onShowOnboarding={onOpenOnboarding} />
        )}
        {modal === "onboarding" && <Onboarding onDone={onOnboardingDone} />}
        {modal === "victory" && (
          <VictoryDialog game={game} onStart={onNewGame} />
        )}
      </section>
    </div>
  );
}

function NewGame({
  game,
  onClose,
  onStart,
}: {
  game: Game;
  onClose: () => void;
  onStart: (sameDeal: boolean) => void;
}) {
  const started = game.board.moves > 0;
  return (
    <>
      <div className="modal-emblem">♠</div>
      <span className="overline">НОВАЯ ПАРТИЯ</span>
      <h2 id="modal-title">
        {started ? "Начать новую игру?" : "Раздать карты?"}
      </h2>
      <p>
        {started
          ? "Текущая партия будет завершена и попадёт в локальную статистику."
          : "Выберите новую раздачу или повторите текущую."}
      </p>
      <div className="modal-actions">
        <button className="primary-action" onClick={() => onStart(false)}>
          Новая раздача
        </button>
        <button className="secondary-action" onClick={() => onStart(true)}>
          <RotateCcw size={17} />
          Начать эту раздачу заново
        </button>
        {started && (
          <button className="text-action" onClick={onClose}>
            Продолжить партию
          </button>
        )}
      </div>
    </>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true">
        <i />
      </span>
    </label>
  );
}

function SettingsDialog({
  settings,
  currentDraw,
  onChange,
  onClose,
  onStart,
}: {
  settings: Settings;
  currentDraw: 1 | 3;
  onChange: (settings: Settings) => void;
  onClose: () => void;
  onStart: () => void;
}) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });
  return (
    <>
      <div className="modal-icon">
        <SettingsIcon />
      </div>
      <span className="overline">ПАРАМЕТРЫ ИГРЫ</span>
      <h2 id="modal-title">Настройки</h2>
      <div className="settings-group">
        <span className="group-label">КАК ОТКРЫВАТЬ КОЛОДУ</span>
        <div className="segmented" role="radiogroup" aria-label="Режим раздачи">
          <button
            role="radio"
            aria-checked={settings.draw === 1}
            className={settings.draw === 1 ? "active" : ""}
            onClick={() => update("draw", 1)}
          >
            По одной · проще
          </button>
          <button
            role="radio"
            aria-checked={settings.draw === 3}
            className={settings.draw === 3 ? "active" : ""}
            onClick={() => update("draw", 3)}
          >
            По три · сложнее
          </button>
        </div>
        <small className="setting-caption">
          За нажатие откроется одна или три карты. В режиме «По три» ходить
          можно только верхней. Новый режим начнёт действовать со следующей
          партии.
        </small>
      </div>
      <div className="settings-list">
        <Toggle
          label="Звук"
          description="Звуки карт и победы; при включении прозвучит проверка"
          checked={settings.sound}
          onChange={(value) => update("sound", value)}
        />
        <Toggle
          label="Анимации"
          description="Перемещения, раздача и переворот"
          checked={settings.animations}
          onChange={(value) => update("animations", value)}
        />
        <Toggle
          label="Двойное нажатие"
          description="Отправлять карту в основание"
          checked={settings.doubleTap}
          onChange={(value) => update("doubleTap", value)}
        />
        <Toggle
          label="Финальный автосбор"
          description="Предлагать только гарантированное завершение"
          checked={settings.autoComplete}
          onChange={(value) => update("autoComplete", value)}
        />
      </div>
      <button
        className="primary-action"
        onClick={settings.draw === currentDraw ? onClose : onStart}
      >
        <Check size={17} />
        {settings.draw === currentDraw
          ? "Готово"
          : "Применить и начать новую партию"}
      </button>
    </>
  );
}

function StatisticsDialog({
  statistics,
  onReset,
}: {
  statistics: Statistics;
  onReset: (statistics: Statistics) => void;
}) {
  const [draw1, draw3] = [statistics.draw1, statistics.draw3];
  const totalPlayed = draw1.played + draw3.played;
  const totalWins = draw1.wins + draw3.wins;
  return (
    <>
      <div className="modal-icon">
        <BarChart3 />
      </div>
      <span className="overline">ТОЛЬКО НА ЭТОМ УСТРОЙСТВЕ</span>
      <h2 id="modal-title">Статистика</h2>
      <div className="stat-hero">
        <strong>
          {totalPlayed ? Math.round((totalWins / totalPlayed) * 100) : 0}%
        </strong>
        <span>общий процент побед</span>
      </div>
      <div className="stat-columns">
        {[
          { title: "По 1 карте", value: draw1 },
          { title: "По 3 карты", value: draw3 },
        ].map(({ title, value }) => (
          <div className="stat-mode" key={title}>
            <h3>{title}</h3>
            <dl>
              <div>
                <dt>Сыграно</dt>
                <dd>{value.played}</dd>
              </div>
              <div>
                <dt>Побед</dt>
                <dd>{value.wins}</dd>
              </div>
              <div>
                <dt>Не завершено</dt>
                <dd>{value.abandoned}</dd>
              </div>
              <div>
                <dt>Процент побед</dt>
                <dd>{winRate(value)}%</dd>
              </div>
              <div>
                <dt>Текущая серия</dt>
                <dd>{value.currentStreak}</dd>
              </div>
              <div>
                <dt>Лучшая серия</dt>
                <dd>{value.bestStreak}</dd>
              </div>
              <div>
                <dt>Лучшее время</dt>
                <dd>{formatTime(value.bestTime)}</dd>
              </div>
              <div>
                <dt>Минимум ходов</dt>
                <dd>{value.minMoves ?? "—"}</dd>
              </div>
              <div>
                <dt>Общее время</dt>
                <dd>{formatTime(value.totalTime)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <button
        className="danger-action"
        onClick={() => {
          if (window.confirm("Сбросить всю локальную статистику?"))
            onReset(emptyStatistics());
        }}
      >
        Сбросить статистику
      </button>
    </>
  );
}

function RulesDialog({
  onClose,
  onShowOnboarding,
}: {
  onClose: () => void;
  onShowOnboarding: () => void;
}) {
  return (
    <>
      <div className="modal-emblem">♣</div>
      <span className="overline">КЛАССИЧЕСКАЯ КОСЫНКА</span>
      <h2 id="modal-title">Как играть</h2>
      <div className="rules-list">
        <p>
          <strong>Цель.</strong> Соберите каждую масть в основаниях от туза до
          короля.
        </p>
        <p>
          <strong>Столбцы.</strong> Кладите карты по убыванию, чередуя красный и
          чёрный цвет. Открытую последовательность можно переносить целиком, а
          пустой столбец принимает только короля.
        </p>
        <p>
          <strong>Колода.</strong> Режим «По одной» проще: доступна каждая
          открытая карта. В режиме «По три» открываются сразу три карты, но
          ходить можно только верхней. Когда колода закончится, нажмите ещё раз
          для нового прохода.
        </p>
        <p>
          <strong>Управление.</strong> Перетащите карту либо выберите её и затем
          место. Двойное нажатие отправляет доступную карту в основание.
        </p>
        <p>
          <strong>Помощь.</strong> «Отменить» возвращает последний ход, а
          «Подсказка» отмечает источник цифрой 1, а место назначения — цифрой 2.
        </p>
        <p>
          <strong>Тупик.</strong> Не каждая случайная раздача гарантированно
          решается. Если ход оказался неудачным, используйте «Отменить» или
          повторите ту же раздачу — начинать всё заново после одной ошибки не
          обязательно.
        </p>
      </div>
      <div className="modal-actions">
        <button className="primary-action" onClick={onClose}>
          Играть
        </button>
        <button className="secondary-action" onClick={onShowOnboarding}>
          <MousePointerClick size={17} />
          Показать обучение
        </button>
      </div>
    </>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  return (
    <>
      <div className="modal-emblem">♠</div>
      <span className="overline">ТРИ ПРОСТЫХ ДЕЙСТВИЯ</span>
      <h2 id="modal-title">Как начать игру</h2>
      <p>
        Освойтесь за несколько секунд — обучение всегда доступно в правилах.
      </p>
      <div className="onboarding-steps">
        <div>
          <MousePointerClick />
          <span>
            <b>1</b>
            <strong>Перемещайте карты</strong>
            <small>Перетащите карту или выберите её и место.</small>
          </span>
        </div>
        <div>
          <Lightbulb />
          <span>
            <b>2</b>
            <strong>Используйте подсказку</strong>
            <small>Она покажет один полезный ход цифрами 1 и 2.</small>
          </span>
        </div>
        <div>
          <Undo2 />
          <span>
            <b>3</b>
            <strong>Ошибку можно отменить</strong>
            <small>Кнопка «Отменить» возвращает последний ход.</small>
          </span>
        </div>
      </div>
      <button className="primary-action" onClick={onDone}>
        Начать играть
      </button>
    </>
  );
}

function VictoryDialog({
  game,
  onStart,
}: {
  game: Game;
  onStart: (sameDeal: boolean) => void;
}) {
  const [shareStatus, setShareStatus] = useState("");
  const share = async () => {
    const text = `Косынка сошлась за ${formatTime(game.elapsed)} и ${game.board.moves} ходов. Сможешь быстрее?`;
    const url = gameShareUrl();
    const result = await shareResult(text, url);
    if (result === "clipboard")
      setShareStatus("Результат и ссылка скопированы");
    else if (result === "manual") {
      window.prompt("Скопируйте результат", `${text}\n${url}`);
      setShareStatus("Ссылка готова для отправки");
    } else if (result !== "cancelled") setShareStatus("Открываем отправку…");
  };
  return (
    <>
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 28 }, (_, index) => (
          <i
            key={index}
            style={
              {
                "--i": index,
                "--x": `${(index * 37 + 5) % 100}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="victory-seal">
        <Trophy />
        <Sparkles className="spark-one" />
        <Sparkles className="spark-two" />
      </div>
      <span className="overline">ВСЕ КАРТЫ СОБРАНЫ</span>
      <h2 id="modal-title">Победа!</h2>
      <p>Отличная партия. Стол снова чист.</p>
      <div className="victory-stats">
        <span>
          <strong>{formatTime(game.elapsed)}</strong>
          <small>время</small>
        </span>
        <span>
          <strong>{game.board.moves}</strong>
          <small>ходов</small>
        </span>
        <span>
          <strong>{game.undos}</strong>
          <small>отмен</small>
        </span>
        <span>
          <strong>{game.board.draw === 1 ? "по 1" : "по 3"}</strong>
          <small>режим</small>
        </span>
      </div>
      <div className="modal-actions">
        <button className="primary-action" onClick={share}>
          <Share2 size={17} />
          Поделиться результатом
        </button>
        {shareStatus && (
          <span className="share-status" role="status">
            {shareStatus}
          </span>
        )}
        <button className="primary-action" onClick={() => onStart(false)}>
          Сыграть ещё
        </button>
        <button className="secondary-action" onClick={() => onStart(true)}>
          <RotateCcw size={17} />
          Новая игра: повторить раздачу
        </button>
      </div>
    </>
  );
}
