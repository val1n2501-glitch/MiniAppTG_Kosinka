export const SUITS = ["spades", "hearts", "clubs", "diamonds"] as const;
export type Suit = (typeof SUITS)[number];
export type Card = { id: string; suit: Suit; rank: number; faceUp: boolean };
export type Board = {
  tableau: Card[][];
  foundations: Card[][];
  stock: Card[];
  waste: Card[];
  draw: 1 | 3;
  moves: number;
};
export type Game = {
  version: 1;
  board: Board;
  history: Board[];
  elapsed: number;
};
export type Source = {
  zone: "tableau" | "foundation" | "waste";
  pile: number;
  index: number;
};
export type Target = { zone: "tableau" | "foundation"; pile: number };
export type Action =
  { type: "move"; from: Source; to: Target } | { type: "draw" };
export const red = (c: Card) => c.suit === "hearts" || c.suit === "diamonds";
export const clone = <T>(v: T): T => structuredClone(v);
export function newGame(draw: 1 | 3 = 1, random = Math.random): Game {
  const deck: Card[] = SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({
      id: `${suit}-${i + 1}`,
      suit,
      rank: i + 1,
      faceUp: false,
    })),
  );
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tableau = Array.from({ length: 7 }, (_, i) => {
    const p = deck.splice(0, i + 1);
    p[i].faceUp = true;
    return p;
  });
  return {
    version: 1,
    board: {
      tableau,
      stock: deck,
      waste: [],
      foundations: [[], [], [], []],
      draw,
      moves: 0,
    },
    history: [],
    elapsed: 0,
  };
}
export function sourceCards(b: Board, s: Source): Card[] {
  if (
    !Number.isInteger(s.index) ||
    !Number.isInteger(s.pile) ||
    s.index < 0 ||
    s.pile < 0
  )
    return [];
  const p =
    s.zone === "tableau"
      ? b.tableau[s.pile]
      : s.zone === "foundation"
        ? b.foundations[s.pile]
        : s.pile === 0
          ? b.waste
          : undefined;
  if (
    !p ||
    s.index >= p.length ||
    (s.zone !== "tableau" && s.index !== p.length - 1)
  )
    return [];
  const cs = p.slice(s.index);
  return cs.every(
    (c, i) =>
      c.faceUp &&
      (i === 0 || (cs[i - 1].rank === c.rank + 1 && red(cs[i - 1]) !== red(c))),
  )
    ? cs
    : [];
}
export function canMove(b: Board, from: Source, to: Target): boolean {
  if (
    !Number.isInteger(to.pile) ||
    to.pile < 0 ||
    (from.zone === to.zone && from.pile === to.pile)
  )
    return false;
  const cs = sourceCards(b, from);
  if (!cs.length) return false;
  const p = to.zone === "tableau" ? b.tableau[to.pile] : b.foundations[to.pile];
  if (!p) return false;
  const top = p.at(-1),
    card = cs[0];
  if (to.zone === "foundation")
    return (
      cs.length === 1 &&
      card.suit === SUITS[to.pile] &&
      card.rank === p.length + 1
    );
  return top
    ? top.faceUp && top.rank === card.rank + 1 && red(top) !== red(card)
    : card.rank === 13;
}
export function apply(game: Game, action: Action): Game {
  if (
    action.type === "draw"
      ? !game.board.stock.length && !game.board.waste.length
      : !canMove(game.board, action.from, action.to)
  )
    return game;
  const b = clone(game.board);
  if (action.type === "draw") {
    if (b.stock.length)
      for (let i = 0; i < b.draw && b.stock.length; i++) {
        const c = b.stock.pop()!;
        c.faceUp = true;
        b.waste.push(c);
      }
    else {
      b.stock = b.waste.reverse().map((c) => ({ ...c, faceUp: false }));
      b.waste = [];
    }
  } else {
    const { from, to } = action;
    const p =
      from.zone === "tableau"
        ? b.tableau[from.pile]
        : from.zone === "foundation"
          ? b.foundations[from.pile]
          : b.waste;
    const cards = p.splice(from.index);
    (to.zone === "tableau" ? b.tableau[to.pile] : b.foundations[to.pile]).push(
      ...cards,
    );
    if (from.zone === "tableau" && p.length) p[p.length - 1].faceUp = true;
  }
  b.moves++;
  assertBoard(b);
  return { ...game, board: b, history: [...game.history, game.board] };
}
export const undo = (g: Game): Game =>
  g.history.length
    ? { ...g, board: g.history.at(-1)!, history: g.history.slice(0, -1) }
    : g;
export const won = (b: Board) => b.foundations.every((p) => p.length === 13);
export function moves(b: Board): Extract<Action, { type: "move" }>[] {
  const sources: Source[] = b.tableau.flatMap((p, pile) =>
    p.map((_, index) => ({ zone: "tableau" as const, pile, index })),
  );
  if (b.waste.length)
    sources.push({ zone: "waste", pile: 0, index: b.waste.length - 1 });
  b.foundations.forEach((p, pile) => {
    if (p.length)
      sources.push({ zone: "foundation", pile, index: p.length - 1 });
  });
  const targets: Target[] = [
    ...SUITS.map((_, pile) => ({ zone: "foundation" as const, pile })),
    ...b.tableau.map((_, pile) => ({ zone: "tableau" as const, pile })),
  ];
  return sources.flatMap((from) =>
    targets
      .filter((to) => canMove(b, from, to))
      .map((to) => ({ type: "move" as const, from, to })),
  );
}
export function hint(b: Board): Action | null {
  const options = moves(b).filter(
    (m) =>
      m.from.zone !== "foundation" &&
      !(
        m.from.zone === "tableau" &&
        m.from.index === 0 &&
        m.to.zone === "tableau" &&
        !b.tableau[m.to.pile].length
      ),
  );
  return (
    options.find((m) => m.to.zone === "foundation") ??
    options.find(
      (m) =>
        m.from.zone === "tableau" &&
        m.from.index > 0 &&
        !b.tableau[m.from.pile][m.from.index - 1].faceUp,
    ) ??
    options[0] ??
    (b.stock.length || b.waste.length ? { type: "draw" } : null)
  );
}
// A finite simulation proves completion before we offer auto-collection.
export function autoPlan(b: Board): Extract<Action, { type: "move" }>[] | null {
  if (
    b.stock.length ||
    b.waste.length ||
    b.tableau.some((p) => p.some((c) => !c.faceUp)) ||
    won(b)
  )
    return null;
  let g: Game = { version: 1, board: clone(b), history: [], elapsed: 0 };
  const plan: Extract<Action, { type: "move" }>[] = [];
  while (!won(g.board)) {
    const next = moves(g.board).find(
      (m) => m.to.zone === "foundation" && m.from.zone === "tableau",
    );
    if (!next) return null;
    plan.push(next);
    g = apply(g, next);
  }
  return plan;
}
export function assertBoard(value: unknown): asserts value is Board {
  const b = value as Board;
  if (
    !b ||
    !Array.isArray(b.tableau) ||
    b.tableau.length !== 7 ||
    !Array.isArray(b.foundations) ||
    b.foundations.length !== 4 ||
    !Array.isArray(b.stock) ||
    !Array.isArray(b.waste) ||
    ![1, 3].includes(b.draw) ||
    !Number.isSafeInteger(b.moves) ||
    b.moves < 0
  )
    throw Error("Некорректная партия");
  const piles = [...b.tableau, ...b.foundations, b.stock, b.waste];
  if (piles.some((p) => !Array.isArray(p))) throw Error("Некорректные стопки");
  const cards = piles.flat();
  if (
    cards.length !== 52 ||
    new Set(cards.map((c) => c?.id)).size !== 52 ||
    cards.some(
      (c) =>
        !c ||
        !SUITS.includes(c.suit) ||
        !Number.isInteger(c.rank) ||
        c.rank < 1 ||
        c.rank > 13 ||
        c.id !== `${c.suit}-${c.rank}` ||
        typeof c.faceUp !== "boolean",
    )
  )
    throw Error("Колода повреждена");
  if (b.stock.some((c) => c.faceUp) || b.waste.some((c) => !c.faceUp))
    throw Error("Некорректная видимость");
  b.foundations.forEach((p, i) => {
    if (p.some((c, j) => !c.faceUp || c.suit !== SUITS[i] || c.rank !== j + 1))
      throw Error("Некорректное основание");
  });
  b.tableau.forEach((p) => {
    if (p.length && !p.at(-1)!.faceUp) throw Error("Верхняя карта закрыта");
    let open = false;
    p.forEach((c, i) => {
      if (
        open &&
        (!c.faceUp || p[i - 1].rank !== c.rank + 1 || red(p[i - 1]) === red(c))
      )
        throw Error("Некорректная последовательность");
      open ||= c.faceUp;
    });
  });
}
export function serialize(g: Game) {
  return JSON.stringify(g);
}
export function restore(raw: string | null): Game | null {
  try {
    if (!raw) return null;
    const g = JSON.parse(raw) as Game;
    if (
      g.version !== 1 ||
      !Number.isSafeInteger(g.elapsed) ||
      g.elapsed < 0 ||
      !Array.isArray(g.history)
    )
      return null;
    assertBoard(g.board);
    g.history.forEach(assertBoard);
    if (
      g.history.length !== g.board.moves ||
      g.history.some((b, i) => b.moves !== i || b.draw !== g.board.draw)
    )
      return null;
    return g;
  } catch {
    return null;
  }
}
