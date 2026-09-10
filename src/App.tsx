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
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Lightbulb,
  Maximize2,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import {
  apply,
  autoPlan,
  canMove,
  hint,
  newGame,
  red,
  restore,
  serialize,
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
import { flushSync } from "react-dom";
import { haptic, initTelegram } from "./telegram";
const KEY = "kosynka.game.v1";
const symbols = { spades: "♠", hearts: "♥", clubs: "♣", diamonds: "♦" };
const suitsRu = {
  spades: "пики",
  hearts: "черви",
  clubs: "трефы",
  diamonds: "бубны",
};
const rank = (n: number) =>
  ({ 1: "Т", 11: "В", 12: "Д", 13: "К" })[n] || `${n}`;
const label = (c: Card) => `${rank(c.rank)} ${suitsRu[c.suit]}`;
const time = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
const same = (a: Source | null, b: Source) =>
  !!a && a.zone === b.zone && a.pile === b.pile && a.index === b.index;
function initial(): Game {
  try {
    return restore(localStorage.getItem(KEY)) || newGame();
  } catch {
    return newGame();
  }
}
function Face({ card }: { card: Card }) {
  return (
    <>
      <span className="corner">
        {rank(card.rank)}
        <span>{symbols[card.suit]}</span>
      </span>
      <span className="pip">{symbols[card.suit]}</span>
      <span className="corner bottom">
        {rank(card.rank)}
        <span>{symbols[card.suit]}</span>
      </span>
    </>
  );
}
type Drag = {
  from: Source;
  x: number;
  y: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  width: number;
  active: boolean;
  pointerId: number;
};
export default function App() {
  const [game, setGame] = useState(initial);
  const gameRef = useRef(game);
  gameRef.current = game;
  const [selected, setSelected] = useState<Source | null>(null);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [modal, setModal] = useState<"new" | "help" | null>(null);
  const [mode, setMode] = useState<1 | 3>(game.board.draw);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [spread, setSpread] = useState(false);
  const [hintTarget, setHintTarget] = useState<Target | "stock" | null>(null);
  const lastTap = useRef({ id: "", at: 0 });
  const suppressClick = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const b = game.board,
    victory = won(b);
  const plan = useMemo(() => autoPlan(b), [b]);
  const cardPositions = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const nextPositions = new Map<string, DOMRect>();
    document
      .querySelectorAll<HTMLElement>("[data-card-id]")
      .forEach((element) => {
        const id = element.dataset.cardId!;
        const rect = element.getBoundingClientRect();
        const before = cardPositions.current.get(id);
        if (
          before &&
          !suppressClick.current &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          const x = before.left - rect.left,
            y = before.top - rect.top;
          if (Math.abs(x) + Math.abs(y) > 1)
            element.animate(
              [
                { transform: `translate(${x}px, ${y}px)` },
                { transform: "translate(0, 0)" },
              ],
              { duration: 180, easing: "ease-out" },
            );
        }
        nextPositions.set(id, rect);
      });
    cardPositions.current = nextPositions;
  }, [b]);
  useEffect(initTelegram, []);
  useEffect(() => {
    const area = boardRef.current;
    if (!area) return;
    const update = () =>
      setScrollable(area.scrollHeight > area.clientHeight + 2);
    const observer = new ResizeObserver(update);
    observer.observe(area);
    update();
    return () => observer.disconnect();
  }, [b, spread]);
  useEffect(() => {
    if (!drag?.active) return;
    let frame: number;
    const scroll = () => {
      const area = boardRef.current,
        current = dragRef.current;
      if (!area || !current?.active) return;
      const bounds = area.getBoundingClientRect();
      if (current.y > bounds.bottom - 45) area.scrollTop += 5;
      else if (current.y < bounds.top + 40) area.scrollTop -= 5;
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [drag?.active]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool(
            tool: unknown,
            options: { signal: AbortSignal },
          ): void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "show_solitaire_hint",
            title: "Показать подсказку",
            description:
              "Подсветить разрешённый ход в текущей партии Косынки. Карты не перемещаются.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input: unknown) {
              if (
                !input ||
                typeof input !== "object" ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw Error("Ожидается пустой объект");
              if (dialog.current?.open) throw Error("Сначала закройте диалог");
              flushSync(() => showHint());
              return { hint: hint(gameRef.current.board) };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser capability. */
    }
    return () => lifecycle.abort();
  }, []);
  useEffect(() => {
    const handle = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(handle);
  }, [notice]);
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(KEY, serialize(gameRef.current));
        setSaveError(false);
      } catch {
        setSaveError(true);
      }
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
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      if (!document.hidden && !victory && !modal) {
        const seconds = Math.floor((now - last) / 1000);
        if (seconds > 0) {
          setGame((g) => ({ ...g, elapsed: g.elapsed + seconds }));
          last += seconds * 1000;
        }
      } else last = now;
    };
    const reset = () => {
      last = Date.now();
    };
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", reset);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [victory, modal]);
  useEffect(() => {
    if (modal || victory) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal, victory]);
  useEffect(() => {
    if (victory) {
      haptic(true);
      setCollecting(false);
    }
  }, [victory]);
  useEffect(() => {
    if (!collecting || modal) return;
    const id = setTimeout(() => {
      const next = autoPlan(gameRef.current.board)?.[0];
      if (next) perform(next);
      else setCollecting(false);
    }, 130);
    return () => clearTimeout(id);
  }, [collecting, b, modal]);
  function perform(action: Action) {
    const current = gameRef.current,
      next = apply(current, action);
    if (current === next) {
      setNotice("Сюда карту перенести нельзя");
      return false;
    }
    gameRef.current = next;
    setGame(next);
    setSelected(null);
    setHintTarget(null);
    setNotice("");
    haptic();
    return true;
  }
  function toFoundation(from: Source) {
    const pile = SUITS.findIndex((_, pile) =>
      canMove(gameRef.current.board, from, { zone: "foundation", pile }),
    );
    if (pile < 0) {
      setNotice("В основание — по масти, начиная с туза");
      return;
    }
    perform({ type: "move", from, to: { zone: "foundation", pile } });
  }
  function tapCard(from: Source, c: Card) {
    if (collecting || modal || victory) return;
    const now = Date.now();
    if (lastTap.current.id === c.id && now - lastTap.current.at < 330) {
      lastTap.current = { id: "", at: 0 };
      toFoundation(from);
      return;
    }
    lastTap.current = { id: c.id, at: now };
    if (selected && !same(selected, from) && from.zone !== "waste") {
      if (
        perform({
          type: "move",
          from: selected,
          to: { zone: from.zone, pile: from.pile },
        })
      )
        return;
    }
    if (sourceCards(b, from).length) {
      setSelected(same(selected, from) ? null : from);
      setHintTarget(null);
    }
  }
  function down(e: ReactPointerEvent, from: Source) {
    if (
      e.button !== 0 ||
      collecting ||
      modal ||
      victory ||
      !sourceCards(b, from).length
    )
      return;
    const box = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      from,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      dx: e.clientX - box.left,
      dy: e.clientY - box.top,
      width: box.width,
      active: false,
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const active =
      d.active || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 7;
    dragRef.current = { ...d, x: e.clientX, y: e.clientY, active };
    if (active) {
      setDrag(dragRef.current);
      setSelected(d.from);
      e.preventDefault();
      const area = boardRef.current;
      if (area) {
        const r = area.getBoundingClientRect();
        if (e.clientY > r.bottom - 60) area.scrollTop += 14;
        if (e.clientY < r.top + 45) area.scrollTop -= 14;
      }
    }
  }
  function up(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (!d.active) return;
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const dest = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-target]");
    if (dest) {
      const [zone, pile] = dest.dataset.target!.split(":");
      perform({
        type: "move",
        from: d.from,
        to: { zone: zone as Target["zone"], pile: Number(pile) },
      });
    } else setNotice("Перенесите карту на подсвеченное место");
  }
  function renderCard(c: Card, from: Source, style?: CSSProperties) {
    const isSelected =
      selected?.zone === from.zone &&
      selected.pile === from.pile &&
      selected.index <= from.index;
    const ghosted =
      drag?.active &&
      drag.from.zone === from.zone &&
      drag.from.pile === from.pile &&
      drag.from.index <= from.index;
    return (
      <button
        key={c.id}
        data-card-id={c.id}
        style={style}
        type="button"
        className={`card ${c.faceUp ? (red(c) ? "red" : "black") : "back"} ${isSelected ? "selected" : ""} ${ghosted ? "ghosted" : ""}`}
        aria-label={c.faceUp ? label(c) : "Закрытая карта"}
        aria-pressed={c.faceUp ? isSelected : undefined}
        disabled={!c.faceUp || collecting}
        onPointerDown={(e) => down(e, from)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          dragRef.current = null;
          setDrag(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!suppressClick.current && c.faceUp) tapCard(from, c);
        }}
      >
        {c.faceUp ? <Face card={c} /> : <span className="back-mark">♠</span>}
      </button>
    );
  }
  const targetClass = (to: Target) =>
    `pile ${selected && canMove(b, selected, to) ? "allowed" : ""} ${hintTarget && hintTarget !== "stock" && hintTarget.zone === to.zone && hintTarget.pile === to.pile ? "hinted" : ""}`;
  const targetClick = (to: Target) => {
    if (selected && !collecting) perform({ type: "move", from: selected, to });
  };
  function showHint() {
    const b = gameRef.current.board;
    const action = hint(b);
    if (!action) {
      setNotice(
        "Доступных ходов нет. Попробуйте отменить ход или начать заново.",
      );
      return;
    }
    if (action.type === "draw") {
      setSelected(null);
      setHintTarget("stock");
      setNotice(
        b.stock.length
          ? "Откройте карты из колоды"
          : "Нажмите на колоду, чтобы начать новый проход",
      );
    } else {
      setSelected(action.from);
      setHintTarget(action.to);
      setNotice(
        `${label(sourceCards(b, action.from)[0])} → ${action.to.zone === "foundation" ? "основание" : `столбец ${action.to.pile + 1}`}`,
      );
    }
  }
  function start() {
    const next = newGame(mode);
    gameRef.current = next;
    setGame(next);
    setModal(null);
    setSelected(null);
    setHintTarget(null);
    setCollecting(false);
    setNotice("Новая партия. Удачи!");
  }
  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-symbol">♠</span>
          <div>
            <h1>Косынка</h1>
            <span className="eyebrow">ПАСЬЯНС</span>
          </div>
        </div>
        <button
          className="icon-button help"
          aria-label="Правила игры"
          onClick={() => setModal("help")}
        >
          <CircleHelp size={21} />
        </button>
        <button
          className="new-button"
          onClick={() => {
            setMode(b.draw);
            setModal("new");
          }}
        >
          <Plus size={18} />
          <span>Новая игра</span>
        </button>
      </header>
      <section className="stats" aria-label="Результаты партии">
        <div>
          <Clock3 size={15} />
          <strong>{time(game.elapsed)}</strong>
          <span>время</span>
        </div>
        <div>
          <span className="moves-icon">↗</span>
          <strong>{b.moves}</strong>
          <span>ходов</span>
        </div>
        <button
          onClick={() => {
            setMode(b.draw);
            setModal("new");
          }}
        >
          По {b.draw === 1 ? "одной" : "три"}
          <ChevronDown size={14} />
        </button>
      </section>
      <main
        ref={boardRef}
        className={`board ${spread ? "spread" : ""}`}
        aria-label="Игровой стол"
      >
        <div className="top-labels">
          <span>
            КОЛОДА <small>{b.stock.length}</small>
          </span>
          <span>СБРОС</span>
          <span className="foundation-label">
            ОСНОВАНИЯ <small>{b.foundations.flat().length} / 52</small>
          </span>
        </div>
        <div className="top-row">
          <div
            className={`stock-wrap ${hintTarget === "stock" ? "hinted" : ""}`}
          >
            <button
              className={`stock ${b.stock.length ? "card back" : "empty-stock"}`}
              aria-label={
                b.stock.length ? "Взять карты из колоды" : "Повторить колоду"
              }
              disabled={collecting || (!b.stock.length && !b.waste.length)}
              onClick={() => perform({ type: "draw" })}
            >
              {b.stock.length ? (
                <span className="back-mark">♠</span>
              ) : (
                <>
                  <RotateCcw size={25} />
                  <span>Ещё раз</span>
                </>
              )}
            </button>
            {b.stock.length > 0 && (
              <span className="stock-count">{b.stock.length}</span>
            )}
          </div>
          <div className="waste pile">
            <span className="empty-symbol">—</span>
            {b.waste.slice(-b.draw).map((c, i, all) => (
              <div
                className="waste-card"
                key={c.id}
                style={{
                  transform: `translateX(${(i - all.length + 1) * 8}px)`,
                }}
              >
                {i === all.length - 1 ? (
                  renderCard(c, {
                    zone: "waste",
                    pile: 0,
                    index: b.waste.length - 1,
                  })
                ) : (
                  <div className={`card ${red(c) ? "red" : "black"}`}>
                    <Face card={c} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="top-spacer" />
          {b.foundations.map((p, pile) => (
            <div
              key={pile}
              data-target={`foundation:${pile}`}
              className={`${targetClass({ zone: "foundation", pile })} foundation`}
              onClick={() => targetClick({ zone: "foundation", pile })}
            >
              <button
                className="slot-button"
                aria-label={`Основание ${suitsRu[SUITS[pile]]}`}
                onClick={(e) => {
                  e.stopPropagation();
                  targetClick({ zone: "foundation", pile });
                }}
              >
                <span>{symbols[SUITS[pile]]}</span>
              </button>
              {p.length > 0 &&
                renderCard(p.at(-1)!, {
                  zone: "foundation",
                  pile,
                  index: p.length - 1,
                })}
            </div>
          ))}
        </div>
        <div className="tableau">
          {b.tableau.map((p, pile) => {
            let offset = 0;
            const positions = p.map((c) => {
              const y = offset;
              offset += c.faceUp ? (spread ? 46 : 29) : 15;
              return y;
            });
            return (
              <div
                key={pile}
                data-target={`tableau:${pile}`}
                className={`${targetClass({ zone: "tableau", pile })} column`}
                style={{
                  height: `calc(var(--card-h) + ${positions.at(-1) || 0}px)`,
                }}
                onClick={() => targetClick({ zone: "tableau", pile })}
              >
                <button
                  className="slot-button king-slot"
                  aria-label={`Пустой столбец ${pile + 1}: только король`}
                  onClick={(e) => {
                    e.stopPropagation();
                    targetClick({ zone: "tableau", pile });
                  }}
                >
                  К
                </button>
                {p.map((c, index) =>
                  renderCard(
                    c,
                    { zone: "tableau", pile, index },
                    { top: positions[index], zIndex: index + 1 },
                  ),
                )}
              </div>
            );
          })}
        </div>
        <div className="table-signature">
          <span>♠</span> МАЛЕНЬКАЯ ПАУЗА ДЛЯ СЕБЯ
        </div>
      </main>
      {scrollable && (
        <div
          className="scroll-controls"
          aria-label="Прокрутка длинных столбцов"
        >
          <button
            aria-label="Прокрутить столбцы вверх"
            onClick={() =>
              boardRef.current?.scrollBy({ top: -200, behavior: "smooth" })
            }
          >
            <ArrowUp size={16} />
          </button>
          <span>Длинные столбцы</span>
          <button
            aria-label="Прокрутить столбцы вниз"
            onClick={() =>
              boardRef.current?.scrollBy({ top: 200, behavior: "smooth" })
            }
          >
            <ArrowDown size={16} />
          </button>
        </div>
      )}
      <div className="feedback" role="status" aria-live="polite">
        {saveError
          ? "Не удалось сохранить игру: хранилище недоступно или заполнено."
          : notice ||
            (collecting
              ? "Собираем карты…"
              : selected
                ? "Выберите подсвеченное место"
                : "Соберите все масти от туза до короля")}
      </div>
      {plan && !collecting && (
        <button
          className="auto-button"
          onClick={() => {
            setSelected(null);
            setCollecting(true);
          }}
        >
          <Sparkles size={17} />
          Собрать в основания
        </button>
      )}
      <nav className="toolbar" aria-label="Действия">
        <button
          disabled={!game.history.length || collecting}
          onClick={() => {
            const next = undo(gameRef.current);
            gameRef.current = next;
            setGame(next);
            setSelected(null);
            setHintTarget(null);
            setNotice("Ход отменён");
            haptic();
          }}
        >
          <RotateCcw />
          <span>Отменить</span>
        </button>
        <button disabled={collecting} onClick={showHint}>
          <Lightbulb />
          <span>Подсказка</span>
        </button>
        <button aria-pressed={spread} onClick={() => setSpread(!spread)}>
          <Maximize2 />
          <span>{spread ? "Сжать" : "Развернуть"}</span>
        </button>
      </nav>
      <footer>
        <span className="save-indicator">
          <Check size={12} />
          {saveError ? "Без сохранения" : "Партия сохраняется"}
        </span>
        <span>КЛАССИЧЕСКАЯ КОСЫНКА</span>
      </footer>
      {drag?.active && (
        <div
          className="drag-stack"
          style={{
            left: drag.x - drag.dx,
            top: drag.y - drag.dy,
            width: drag.width,
          }}
        >
          {sourceCards(b, drag.from).map((c, i) => (
            <div
              key={c.id}
              className={`card ${red(c) ? "red" : "black"}`}
              style={{ top: i * (spread ? 46 : 29) }}
            >
              <Face card={c} />
            </div>
          ))}
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (victory) e.preventDefault();
          else setModal(null);
        }}
        onClick={(e) => {
          if (e.target === dialog.current && !victory) setModal(null);
        }}
      >
        <div className="dialog-content">
          {!victory && (
            <button
              className="dialog-close"
              aria-label="Закрыть"
              onClick={() => setModal(null)}
            >
              <X />
            </button>
          )}
          {victory ? (
            <>
              <span className="dialog-emblem">
                <Trophy size={40} />
              </span>
              <div className="eyebrow">ВСЕ КАРТЫ НА СВОИХ МЕСТАХ</div>
              <h2>Красиво сыграно!</h2>
              <p>Пасьянс сошёлся. Ещё одну партию?</p>
              <div className="win-stats">
                <span>
                  <strong>{time(game.elapsed)}</strong>время
                </span>
                <span>
                  <strong>{b.moves}</strong>ходов
                </span>
              </div>
              <button className="primary" onClick={start}>
                <Play size={18} />
                Новая игра
              </button>
            </>
          ) : modal === "new" ? (
            <>
              <span className="dialog-emblem">♠</span>
              <h2>Новая партия</h2>
              <p>
                Текущая партия будет сброшена. Как открывать карты из колоды?
              </p>
              <div className="mode-options">
                <button
                  className={mode === 1 ? "active" : ""}
                  onClick={() => setMode(1)}
                >
                  <strong>По одной</strong>
                  <span>Спокойный темп</span>
                </button>
                <button
                  className={mode === 3 ? "active" : ""}
                  onClick={() => setMode(3)}
                >
                  <strong>По три</strong>
                  <span>Больше стратегии</span>
                </button>
              </div>
              <button className="primary" onClick={start}>
                <Play size={18} />
                Раздать карты
              </button>
              <button className="secondary" onClick={() => setModal(null)}>
                <ArrowLeft size={16} />
                Продолжить партию
              </button>
            </>
          ) : (
            <>
              <span className="dialog-emblem">♧</span>
              <h2>Как играть</h2>
              <p>Соберите четыре масти в основаниях: от туза до короля.</p>
              <ul>
                <li>
                  В столбцах — по убыванию, чередуя красные и чёрные масти.
                </li>
                <li>
                  Переносите карту или открытую последовательность. В пустое
                  место можно положить только короля.
                </li>
                <li>
                  Перетаскивайте карты или нажмите на карту, а затем на место
                  назначения.
                </li>
                <li>
                  Двойное нажатие отправляет карту в основание, если ход
                  разрешён.
                </li>
                <li>
                  Нажимайте на колоду для раздачи. Повторных проходов сколько
                  угодно.
                </li>
                <li>
                  Длинный столбец можно прокрутить; «Развернуть» увеличивает
                  расстояния между картами.
                </li>
              </ul>
              <p className="help-note">
                Не каждая случайная раздача решается. Подсказка показывает
                разрешённый ход, но не гарантирует победу. Таймер
                приостанавливается, когда игра скрыта.
              </p>
              <button className="primary" onClick={() => setModal(null)}>
                Всё понятно
              </button>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
