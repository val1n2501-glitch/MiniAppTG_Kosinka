import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  BarChart3,
  Check,
  CircleHelp,
  Clock3,
  Lightbulb,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import {
  apply,
  autoPlan,
  canMove,
  hint,
  newGame,
  restartGame,
  sourceCards,
  SUITS,
  undo,
  won,
  type Action,
  type Card,
  type Game,
  type Source,
  type Target,
} from "./game";
import { playSound } from "./audio";
import { CardView, cardLabel, suitName, suitSymbol } from "./components/Card";
import { GameDialog, type ModalKind } from "./components/Dialogs";
import {
  loadGame,
  loadSettings,
  loadStatistics,
  recordFinishedGame,
  saveGame,
  saveSettings,
  saveStatistics,
  type Settings,
  type Statistics,
} from "./storage";
import { haptic, initTelegram } from "./telegram";

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
const sameSource = (left: Source | null, right: Source) =>
  !!left &&
  left.zone === right.zone &&
  left.pile === right.pile &&
  left.index === right.index;
const sameTarget = (left: Target | null, right: Target) =>
  !!left && left.zone === right.zone && left.pile === right.pile;
const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type DragState = {
  from: Source;
  x: number;
  y: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  pointerId: number;
  active: boolean;
  returning: boolean;
  target: Target | null;
};

function initialState() {
  const settings = loadSettings();
  const saved = loadGame();
  return { settings, game: saved ?? newGame(settings.draw), freshDeal: !saved };
}

export default function App() {
  const initial = useMemo(initialState, []);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [game, setGame] = useState<Game>(initial.game);
  const [statistics, setStatistics] = useState<Statistics>(loadStatistics);
  const [modal, setModal] = useState<ModalKind>(null);
  const [selected, setSelected] = useState<Source | null>(null);
  const [hintAction, setHintAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [drawnCards, setDrawnCards] = useState<string[]>([]);
  const [dealing, setDealing] = useState(initial.freshDeal);
  const [boardSize, setBoardSize] = useState({ width: 700, height: 600 });
  const gameRef = useRef(game);
  const timerTextRef = useRef<HTMLElement>(null);
  const lastPersistedElapsed = useRef(game.elapsed);
  const dragRef = useRef<DragState | null>(null);
  const boardRef = useRef<HTMLElement>(null);
  const lastTap = useRef({ cardId: "", at: 0 });
  const suppressClick = useRef(false);
  const cardPositions = useRef(new Map<string, DOMRect>());
  const victoryTimer = useRef<number | null>(null);
  const recordedWin = useRef(
    game.winRecorded ? `${game.seed}:${game.board.moves}` : "",
  );
  const board = game.board;
  const victory = won(board);
  const safePlan = useMemo(() => autoPlan(board), [board]);
  dragRef.current = drag;

  useEffect(initTelegram, []);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(
      "motion-off",
      !settings.animations || prefersReducedMotion(),
    );
    saveSettings(settings);
  }, [settings]);
  useEffect(() => saveStatistics(statistics), [statistics]);
  useEffect(() => {
    const save = () => {
      setSaveError(!saveGame(gameRef.current));
      lastPersistedElapsed.current = gameRef.current.elapsed;
    };
    save();
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, [game]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!dealing) return;
    const timer = window.setTimeout(
      () => setDealing(false),
      settings.animations ? 720 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [dealing, settings.animations]);
  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      if (!document.hidden && !victory && !modal) {
        const seconds = Math.floor((now - last) / 1000);
        if (seconds > 0) {
          const elapsed = gameRef.current.elapsed + seconds;
          gameRef.current = { ...gameRef.current, elapsed };
          if (timerTextRef.current)
            timerTextRef.current.textContent = formatTime(elapsed);
          if (elapsed - lastPersistedElapsed.current >= 15) {
            setSaveError(!saveGame(gameRef.current));
            lastPersistedElapsed.current = elapsed;
          }
          last += seconds * 1000;
        }
      } else last = now;
    };
    const interval = window.setInterval(tick, 1000);
    const reset = () => {
      last = Date.now();
    };
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [modal, victory]);
  useEffect(() => {
    if (!victory || game.winRecorded) return;
    const winKey = `${game.seed}:${game.board.moves}`;
    if (recordedWin.current === winKey) return;
    recordedWin.current = winKey;
    const recorded = { ...game, winRecorded: true };
    gameRef.current = recorded;
    setGame(recorded);
    setStatistics((current) => recordFinishedGame(current, recorded, "win"));
    setCollecting(false);
    playSound("win", settings.sound);
    haptic(true);
    victoryTimer.current = window.setTimeout(
      () => setModal("victory"),
      settings.animations ? 520 : 0,
    );
  }, [game, settings.animations, settings.sound, victory]);
  useEffect(
    () => () => {
      if (victoryTimer.current !== null)
        window.clearTimeout(victoryTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!settings.autoComplete || !safePlan || collecting || modal) return;
    const timer = window.setTimeout(() => setCollecting(true), 650);
    return () => window.clearTimeout(timer);
  }, [collecting, modal, safePlan, settings.autoComplete]);
  useEffect(() => {
    if (!collecting || modal) return;
    const timer = window.setTimeout(
      () => {
        const next = autoPlan(gameRef.current.board)?.[0];
        if (next) perform(next);
        else setCollecting(false);
      },
      settings.animations ? 190 : 20,
    );
    return () => window.clearTimeout(timer);
  }, [board, collecting, modal, settings.animations]);
  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && modal !== "victory") setModal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal]);
  useEffect(() => {
    const area = boardRef.current;
    if (!area) return;
    const update = () =>
      setBoardSize({ width: area.clientWidth, height: area.clientHeight });
    const observer = new ResizeObserver(update);
    observer.observe(area);
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!drag?.active) return;
    let frame = 0;
    const scroll = () => {
      const area = boardRef.current;
      const current = dragRef.current;
      if (!area || !current?.active) return;
      const bounds = area.getBoundingClientRect();
      if (current.y > bounds.bottom - 48) area.scrollTop += 6;
      if (current.y < bounds.top + 42) area.scrollTop -= 6;
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [drag?.active]);

  useLayoutEffect(() => {
    if (!settings.animations || prefersReducedMotion()) return;
    const next = new Map<string, DOMRect>();
    document
      .querySelectorAll<HTMLElement>("[data-card-id]")
      .forEach((element) => {
        const id = element.dataset.cardId!;
        const rect = element.getBoundingClientRect();
        const previous = cardPositions.current.get(id);
        if (previous && !drag?.active) {
          const x = previous.left - rect.left;
          const y = previous.top - rect.top;
          if (Math.abs(x) + Math.abs(y) > 2)
            element.animate(
              [
                { transform: `translate(${x}px, ${y}px)`, zIndex: 90 },
                { transform: "translate(0, 0)", zIndex: 90 },
              ],
              { duration: 190, easing: "cubic-bezier(.2,.8,.2,1)" },
            );
        }
        next.set(id, rect);
      });
    cardPositions.current = next;
  }, [board, drag?.active, settings.animations]);

  function setCurrentGame(next: Game) {
    gameRef.current = next;
    lastPersistedElapsed.current = next.elapsed;
    setGame(next);
  }

  function perform(action: Action): boolean {
    const current = gameRef.current;
    const next = apply(current, action);
    if (next === current) {
      setNotice("Этот ход недоступен");
      playSound("invalid", settings.sound);
      return false;
    }
    const sourceTableau =
      action.type === "move" && action.from.zone === "tableau"
        ? action.from.pile
        : null;
    const previouslyCovered =
      sourceTableau === null
        ? undefined
        : current.board.tableau[sourceTableau]
            .filter((card) => !card.faceUp)
            .at(-1)?.id;
    const nowOpen =
      previouslyCovered &&
      sourceTableau !== null &&
      next.board.tableau[sourceTableau].find(
        (card) => card.id === previouslyCovered,
      )?.faceUp;
    if (nowOpen) {
      setFlippedCard(previouslyCovered);
      window.setTimeout(() => setFlippedCard(null), 360);
      playSound("flip", settings.sound);
    } else {
      playSound(action.type === "draw" ? "draw" : "move", settings.sound);
    }
    if (action.type === "draw") {
      const oldIds = new Set(current.board.waste.map((card) => card.id));
      setDrawnCards(
        next.board.waste
          .filter((card) => !oldIds.has(card.id))
          .map((card) => card.id),
      );
      window.setTimeout(() => setDrawnCards([]), 320);
    }
    setCurrentGame(next);
    setSelected(null);
    setHintAction(null);
    setNotice("");
    haptic();
    return true;
  }

  function moveToFoundation(from: Source) {
    const pile = SUITS.findIndex((_, pileIndex) =>
      canMove(gameRef.current.board, from, {
        zone: "foundation",
        pile: pileIndex,
      }),
    );
    if (pile < 0) {
      setNotice("В основание карты идут по масти, начиная с туза");
      playSound("invalid", settings.sound);
      return;
    }
    perform({ type: "move", from, to: { zone: "foundation", pile } });
  }

  function tapCard(from: Source, card: Card) {
    if (collecting || modal || victory) return;
    const now = Date.now();
    if (
      settings.doubleTap &&
      lastTap.current.cardId === card.id &&
      now - lastTap.current.at < 340
    ) {
      lastTap.current = { cardId: "", at: 0 };
      moveToFoundation(from);
      return;
    }
    lastTap.current = { cardId: card.id, at: now };
    if (selected && !sameSource(selected, from) && from.zone !== "waste") {
      const target: Target = { zone: from.zone, pile: from.pile };
      if (perform({ type: "move", from: selected, to: target })) return;
    }
    if (sourceCards(gameRef.current.board, from).length) {
      setSelected(sameSource(selected, from) ? null : from);
      setHintAction(null);
      setNotice(
        sameSource(selected, from) ? "" : "Теперь выберите подсвеченное место",
      );
    }
  }

  function pointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    from: Source,
  ) {
    if (
      event.button !== 0 ||
      collecting ||
      modal ||
      victory ||
      !sourceCards(board, from).length
    )
      return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      from,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      width: bounds.width,
      pointerId: event.pointerId,
      active: false,
      returning: false,
      target: null,
    });
  }

  function pointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId || current.returning)
      return;
    const active =
      current.active ||
      Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      ) > 7;
    let target: Target | null = null;
    if (active) {
      event.preventDefault();
      const element = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-target]");
      if (element?.dataset.target) {
        const [zone, pile] = element.dataset.target.split(":");
        target = { zone: zone as Target["zone"], pile: Number(pile) };
      }
    }
    setDrag({ ...current, x: event.clientX, y: event.clientY, active, target });
    if (active) setSelected(current.from);
  }

  function pointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.active) {
      setDrag(null);
      return;
    }
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (current.target && canMove(board, current.from, current.target)) {
      setDrag(null);
      perform({ type: "move", from: current.from, to: current.target });
      return;
    }
    setDrag({
      ...current,
      x: current.startX,
      y: current.startY,
      target: null,
      returning: true,
    });
    setNotice("Этот ход недоступен");
    playSound("invalid", settings.sound);
    window.setTimeout(
      () => {
        setDrag(null);
        setSelected(null);
      },
      settings.animations ? 190 : 0,
    );
  }

  function showHint() {
    const action = hint(gameRef.current.board);
    setHintAction(action);
    if (!action) {
      setNotice("Доступных ходов не найдено");
      return;
    }
    if (action.type === "draw") {
      setSelected(null);
      setNotice(
        board.stock.length
          ? "Откройте карты из колоды"
          : "Начните новый проход колоды",
      );
    } else {
      setSelected(action.from);
      const moving = sourceCards(board, action.from)[0];
      setNotice(
        `${cardLabel(moving)} → ${action.to.zone === "foundation" ? "основание" : `столбец ${action.to.pile + 1}`}`,
      );
    }
  }

  function startGame(sameDeal: boolean) {
    if (victoryTimer.current !== null)
      window.clearTimeout(victoryTimer.current);
    recordedWin.current = "";
    const current = gameRef.current;
    if (
      current.board.moves > 0 &&
      !won(current.board) &&
      !current.winRecorded
    ) {
      setStatistics((value) => recordFinishedGame(value, current, "abandoned"));
    }
    const next = sameDeal
      ? restartGame(current, settings.draw)
      : newGame(settings.draw);
    setCurrentGame(next);
    setSelected(null);
    setHintAction(null);
    setCollecting(false);
    setModal(null);
    setDealing(true);
    setNotice(sameDeal ? "Раздача начата заново" : "Новая партия. Удачи!");
    playSound("new", settings.sound);
  }

  function doUndo() {
    const next = undo(gameRef.current);
    if (next === gameRef.current) return;
    setCurrentGame(next);
    setSelected(null);
    setHintAction(null);
    setCollecting(false);
    setNotice("Ход отменён");
    playSound("undo", settings.sound);
    haptic();
  }

  const layout = useMemo(() => {
    const gap = boardSize.width <= 430 ? 5 : boardSize.width <= 760 ? 9 : 14;
    const cardWidth = (boardSize.width - gap * 6 - 4) / 7;
    const cardHeight = cardWidth * 1.43;
    const tableauRoom = Math.max(
      cardHeight + 70,
      boardSize.height - cardHeight - 92,
    );
    return board.tableau.map((pile) => {
      const closed = pile.filter((card) => !card.faceUp).length;
      const open = pile.length - closed;
      const faceGap =
        open > 1
          ? Math.max(
              19,
              Math.min(
                42,
                (tableauRoom - cardHeight - closed * 13) / (open - 1),
              ),
            )
          : 30;
      let y = 0;
      return pile.map((card) => {
        const position = y;
        y += card.faceUp ? faceGap : 13;
        return position;
      });
    });
  }, [board.tableau, boardSize]);

  function targetState(target: Target) {
    const source = drag?.active ? drag.from : selected;
    const allowed = !!source && canMove(board, source, target);
    const hovered = drag?.active && sameTarget(drag.target, target);
    const hinted =
      hintAction?.type === "move" && sameTarget(hintAction.to, target);
    return [
      allowed && "is-allowed",
      hovered && (allowed ? "is-drop-valid" : "is-drop-invalid"),
      hinted && "is-target-hint",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function targetClick(target: Target) {
    if (selected && !collecting)
      perform({ type: "move", from: selected, to: target });
  }

  function renderCard(
    card: Card,
    from: Source,
    style?: CSSProperties,
    dealIndex?: number,
  ) {
    const selectedSequence =
      selected?.zone === from.zone &&
      selected.pile === from.pile &&
      selected.index <= from.index;
    const ghosted =
      drag?.active &&
      drag.from.zone === from.zone &&
      drag.from.pile === from.pile &&
      drag.from.index <= from.index;
    const sourceHint =
      hintAction?.type === "move" && sameSource(hintAction.from, from);
    return (
      <CardView
        key={card.id}
        card={card}
        style={style}
        selected={selectedSequence}
        ghosted={ghosted}
        hinted={sourceHint}
        justFlipped={flippedCard === card.id}
        dealingIndex={dealing && card.faceUp ? dealIndex : undefined}
        className={drawnCards.includes(card.id) ? "is-stock-draw" : ""}
        disabled={!card.faceUp || collecting}
        onPointerDown={(event) => pointerDown(event, from)}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => setDrag(null)}
        onClick={(event) => {
          event.stopPropagation();
          if (!suppressClick.current && card.faceUp) tapCard(from, card);
        }}
      />
    );
  }

  let dealIndex = 0;
  return (
    <div className="game-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">♠</span>
          <div>
            <h1>Косынка</h1>
            <span>КЛАССИЧЕСКИЙ ПАСЬЯНС</span>
          </div>
        </div>
        <div className="top-actions">
          <button
            className="quiet-button"
            title="Как играть"
            aria-label="Как играть"
            onClick={() => setModal("rules")}
          >
            <CircleHelp />
          </button>
          <button
            className="quiet-button"
            title="Статистика"
            aria-label="Статистика"
            onClick={() => setModal("statistics")}
          >
            <BarChart3 />
          </button>
          <button
            className="quiet-button"
            title="Настройки"
            aria-label="Настройки"
            onClick={() => setModal("settings")}
          >
            <SettingsIcon />
          </button>
          <button className="new-game-button" onClick={() => setModal("new")}>
            <Plus />
            <span>Новая игра</span>
          </button>
        </div>
      </header>

      <div className="game-status" aria-label="Состояние партии">
        <span>
          <Clock3 />
          <strong ref={timerTextRef}>
            {formatTime(gameRef.current.elapsed)}
          </strong>
          <small>время</small>
        </span>
        <span>
          <i>↗</i> <strong>{board.moves}</strong>
          <small>ходов</small>
        </span>
        <span className="draw-badge">Раздача ×{board.draw}</span>
      </div>

      <main ref={boardRef} className="game-board" aria-label="Игровой стол">
        <div
          className="board-top"
          style={
            {
              "--board-gap": `${boardSize.width <= 430 ? 5 : boardSize.width <= 760 ? 9 : 14}px`,
            } as CSSProperties
          }
        >
          <div
            className={`stock-area ${hintAction?.type === "draw" ? "is-target-hint" : ""}`}
          >
            <span className="pile-label">
              КОЛОДА <b>{board.stock.length}</b>
            </span>
            <button
              className={`stock-button ${board.stock.length ? "has-cards" : ""}`}
              title={
                board.stock.length ? "Открыть карты" : "Начать новый проход"
              }
              aria-label={
                board.stock.length
                  ? "Взять карты из колоды"
                  : "Повторить колоду"
              }
              disabled={
                collecting || (!board.stock.length && !board.waste.length)
              }
              onClick={() => perform({ type: "draw" })}
            >
              {board.stock.length ? (
                <div className="stock-card">
                  <div className="card-back">
                    <div className="back-border">
                      <div className="back-rosette">♠</div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <RotateCcw />
                  <small>Ещё раз</small>
                </>
              )}
            </button>
          </div>
          <div className="waste-area card-slot">
            <span className="pile-label">СБРОС</span>
            <span className="empty-dash">—</span>
            {board.waste.slice(-board.draw).map((card, index, visible) => (
              <div
                className="waste-card"
                key={card.id}
                style={{
                  transform: `translateX(${(index - visible.length + 1) * Math.min(9, boardSize.width / 55)}px)`,
                  zIndex: index + 1,
                }}
              >
                {index === visible.length - 1 ? (
                  renderCard(card, {
                    zone: "waste",
                    pile: 0,
                    index: board.waste.length - 1,
                  })
                ) : (
                  <CardView card={card} interactive={false} />
                )}
              </div>
            ))}
          </div>
          <div className="top-space" />
          {board.foundations.map((pile, pileIndex) => {
            const target: Target = { zone: "foundation", pile: pileIndex };
            return (
              <div
                key={SUITS[pileIndex]}
                className={`foundation-area card-slot ${targetState(target)}`}
                data-target={`foundation:${pileIndex}`}
                onClick={() => targetClick(target)}
              >
                <span className="pile-label">
                  {pileIndex === 0 ? "ОСНОВАНИЯ" : ""}
                </span>
                <button
                  className="slot-hit"
                  aria-label={`Основание: ${suitName[SUITS[pileIndex]]}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    targetClick(target);
                  }}
                >
                  <span>{suitSymbol[SUITS[pileIndex]]}</span>
                </button>
                {pile.length > 0 &&
                  renderCard(pile.at(-1)!, {
                    zone: "foundation",
                    pile: pileIndex,
                    index: pile.length - 1,
                  })}
                {(targetState(target).includes("is-allowed") ||
                  targetState(target).includes("is-drop-valid")) && (
                  <span className="drop-check" aria-hidden="true">
                    <Check />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div
          className="tableau"
          style={
            {
              "--board-gap": `${boardSize.width <= 430 ? 5 : boardSize.width <= 760 ? 9 : 14}px`,
            } as CSSProperties
          }
        >
          {board.tableau.map((pile, pileIndex) => {
            const target: Target = { zone: "tableau", pile: pileIndex };
            const positions = layout[pileIndex];
            const height = `calc(var(--card-height) + ${positions.at(-1) ?? 0}px)`;
            return (
              <div
                key={pileIndex}
                className={`tableau-pile card-slot ${targetState(target)}`}
                data-target={`tableau:${pileIndex}`}
                style={{ height }}
                onClick={() => targetClick(target)}
              >
                <button
                  className="slot-hit king-slot"
                  aria-label={`Пустой столбец ${pileIndex + 1}. Только для короля`}
                  onClick={(event) => {
                    event.stopPropagation();
                    targetClick(target);
                  }}
                >
                  К
                </button>
                {pile.map((card, cardIndex) => {
                  const currentDealIndex = dealIndex++;
                  return renderCard(
                    card,
                    { zone: "tableau", pile: pileIndex, index: cardIndex },
                    { top: positions[cardIndex], zIndex: cardIndex + 1 },
                    currentDealIndex,
                  );
                })}
                {(targetState(target).includes("is-allowed") ||
                  targetState(target).includes("is-drop-valid")) && (
                  <span className="drop-check" aria-hidden="true">
                    <Check />
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="felt-signature" aria-hidden="true">
          <span>♠</span> КЛАССИЧЕСКАЯ КОСЫНКА
        </div>
      </main>

      <div className="notice" role="status" aria-live="polite">
        {saveError
          ? "Партия работает, но сохранение сейчас недоступно"
          : collecting
            ? "Финальный сбор…"
            : notice ||
              (selected
                ? "Выберите подсвеченное место"
                : "Соберите четыре масти от туза до короля")}
      </div>
      {safePlan && !collecting && !settings.autoComplete && (
        <button className="complete-button" onClick={() => setCollecting(true)}>
          <Sparkles />
          Завершить партию
        </button>
      )}

      <nav className="game-controls" aria-label="Основные действия">
        <button
          title="Отменить последний ход"
          disabled={!game.history.length || collecting}
          onClick={doUndo}
        >
          <RotateCcw />
          <span>Отменить</span>
        </button>
        <button
          title="Показать полезный ход"
          disabled={collecting}
          onClick={showHint}
        >
          <Lightbulb />
          <span>Подсказка</span>
        </button>
        <button
          title="Открыть статистику"
          onClick={() => setModal("statistics")}
        >
          <BarChart3 />
          <span>Статистика</span>
        </button>
        <button title="Открыть настройки" onClick={() => setModal("settings")}>
          <SettingsIcon />
          <span>Настройки</span>
        </button>
      </nav>
      <footer>
        <span>
          <Check /> {saveError ? "Без сохранения" : "Партия сохранена"}
        </span>
        <span>ЛОКАЛЬНАЯ ИГРА</span>
      </footer>

      {drag?.active && (
        <div
          className={`drag-stack ${drag.returning ? "is-returning" : ""}`}
          style={{
            left: drag.x - drag.offsetX,
            top: drag.y - drag.offsetY,
            width: drag.width,
          }}
        >
          {sourceCards(board, drag.from).map((card, index) => (
            <CardView
              key={card.id}
              card={card}
              interactive={false}
              style={{
                top:
                  index *
                  Math.max(
                    19,
                    Math.min(
                      42,
                      layout[drag.from.pile]?.[drag.from.index + 1] -
                        layout[drag.from.pile]?.[drag.from.index] || 30,
                    ),
                  ),
              }}
            />
          ))}
        </div>
      )}

      <GameDialog
        modal={modal}
        game={game}
        settings={settings}
        statistics={statistics}
        onClose={() => setModal(null)}
        onSettings={setSettings}
        onNewGame={startGame}
        onResetStatistics={setStatistics}
      />
    </div>
  );
}
