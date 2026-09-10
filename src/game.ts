export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
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
  version: 2;
  board: Board;
  history: Board[];
  elapsed: number;
  seed: number;
  undos: number;
  winRecorded: boolean;
};
export type Source = {
  zone: "tableau" | "foundation" | "waste";
  pile: number;
  index: number;
};
export type Target = { zone: "tableau" | "foundation"; pile: number };
export type MoveAction = { type: "move"; from: Source; to: Target };
export type Action = MoveAction | { type: "draw" };

export const red = (card: Card) =>
  card.suit === "hearts" || card.suit === "diamonds";
export const clone = <T>(value: T): T => structuredClone(value);

export function randomSeed(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues)
    return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 || 1;
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function newGame(draw: 1 | 3 = 1, seed = randomSeed()): Game {
  const random = seededRandom(seed);
  const deck: Card[] = SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, index) => ({
      id: `${suit}-${index + 1}`,
      suit,
      rank: index + 1,
      faceUp: false,
    })),
  );
  for (let index = deck.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  const tableau = Array.from({ length: 7 }, (_, pileIndex) => {
    const pile = deck.splice(0, pileIndex + 1);
    pile[pileIndex].faceUp = true;
    return pile;
  });
  return {
    version: 2,
    board: {
      tableau,
      foundations: [[], [], [], []],
      stock: deck,
      waste: [],
      draw,
      moves: 0,
    },
    history: [],
    elapsed: 0,
    seed: seed >>> 0,
    undos: 0,
    winRecorded: false,
  };
}

export const restartGame = (game: Game, draw = game.board.draw) =>
  newGame(draw, game.seed);

export function sourceCards(board: Board, source: Source): Card[] {
  if (
    !Number.isInteger(source.index) ||
    !Number.isInteger(source.pile) ||
    source.index < 0 ||
    source.pile < 0
  )
    return [];
  const pile =
    source.zone === "tableau"
      ? board.tableau[source.pile]
      : source.zone === "foundation"
        ? board.foundations[source.pile]
        : source.pile === 0
          ? board.waste
          : undefined;
  if (
    !pile ||
    source.index >= pile.length ||
    (source.zone !== "tableau" && source.index !== pile.length - 1)
  )
    return [];
  const cards = pile.slice(source.index);
  return cards.every(
    (card, index) =>
      card.faceUp &&
      (index === 0 ||
        (cards[index - 1].rank === card.rank + 1 &&
          red(cards[index - 1]) !== red(card))),
  )
    ? cards
    : [];
}

export function canMove(board: Board, from: Source, to: Target): boolean {
  if (
    !Number.isInteger(to.pile) ||
    to.pile < 0 ||
    (from.zone === to.zone && from.pile === to.pile)
  )
    return false;
  const cards = sourceCards(board, from);
  if (!cards.length) return false;
  const targetPile =
    to.zone === "tableau" ? board.tableau[to.pile] : board.foundations[to.pile];
  if (!targetPile) return false;
  const targetCard = targetPile.at(-1),
    movingCard = cards[0];
  if (to.zone === "foundation")
    return (
      cards.length === 1 &&
      movingCard.suit === SUITS[to.pile] &&
      movingCard.rank === targetPile.length + 1
    );
  return targetCard
    ? targetCard.faceUp &&
        targetCard.rank === movingCard.rank + 1 &&
        red(targetCard) !== red(movingCard)
    : movingCard.rank === 13;
}

export function apply(game: Game, action: Action): Game {
  if (
    action.type === "draw"
      ? !game.board.stock.length && !game.board.waste.length
      : !canMove(game.board, action.from, action.to)
  )
    return game;
  const board = clone(game.board);
  if (action.type === "draw") {
    if (board.stock.length) {
      for (let index = 0; index < board.draw && board.stock.length; index++) {
        const card = board.stock.pop()!;
        card.faceUp = true;
        board.waste.push(card);
      }
    } else {
      board.stock = board.waste
        .reverse()
        .map((card) => ({ ...card, faceUp: false }));
      board.waste = [];
    }
  } else {
    const sourcePile =
      action.from.zone === "tableau"
        ? board.tableau[action.from.pile]
        : action.from.zone === "foundation"
          ? board.foundations[action.from.pile]
          : board.waste;
    const cards = sourcePile.splice(action.from.index);
    const targetPile =
      action.to.zone === "tableau"
        ? board.tableau[action.to.pile]
        : board.foundations[action.to.pile];
    targetPile.push(...cards);
    if (action.from.zone === "tableau" && sourcePile.length)
      sourcePile[sourcePile.length - 1].faceUp = true;
  }
  board.moves++;
  assertBoard(board);
  return { ...game, board, history: [...game.history, game.board] };
}

export function undo(game: Game): Game {
  return game.history.length
    ? {
        ...game,
        board: game.history.at(-1)!,
        history: game.history.slice(0, -1),
        undos: game.undos + 1,
      }
    : game;
}

export const won = (board: Board) =>
  board.foundations.every((pile) => pile.length === 13);

export function moves(board: Board): MoveAction[] {
  const sources: Source[] = board.tableau.flatMap((pile, pileIndex) =>
    pile.map((_, index) => ({
      zone: "tableau" as const,
      pile: pileIndex,
      index,
    })),
  );
  if (board.waste.length)
    sources.push({ zone: "waste", pile: 0, index: board.waste.length - 1 });
  board.foundations.forEach((pile, pileIndex) => {
    if (pile.length)
      sources.push({
        zone: "foundation",
        pile: pileIndex,
        index: pile.length - 1,
      });
  });
  const targets: Target[] = [
    ...SUITS.map((_, pile) => ({ zone: "foundation" as const, pile })),
    ...board.tableau.map((_, pile) => ({ zone: "tableau" as const, pile })),
  ];
  return sources.flatMap((from) =>
    targets
      .filter((to) => canMove(board, from, to))
      .map((to) => ({ type: "move", from, to })),
  );
}

export function hint(board: Board): Action | null {
  const options = moves(board).filter(
    (move) =>
      move.from.zone !== "foundation" &&
      !(
        move.from.zone === "tableau" &&
        move.from.index === 0 &&
        move.to.zone === "tableau" &&
        !board.tableau[move.to.pile].length
      ),
  );
  return (
    options.find((move) => move.to.zone === "foundation") ??
    options.find(
      (move) =>
        move.from.zone === "tableau" &&
        move.from.index > 0 &&
        !board.tableau[move.from.pile][move.from.index - 1].faceUp,
    ) ??
    options[0] ??
    (board.stock.length || board.waste.length ? { type: "draw" } : null)
  );
}

// A finite simulation proves that every remaining tableau card can be promoted.
export function autoPlan(board: Board): MoveAction[] | null {
  if (
    board.stock.length ||
    board.waste.length ||
    board.tableau.some((pile) => pile.some((card) => !card.faceUp)) ||
    won(board)
  )
    return null;
  let game: Game = {
    version: 2,
    board: clone(board),
    history: [],
    elapsed: 0,
    seed: 1,
    undos: 0,
    winRecorded: false,
  };
  const plan: MoveAction[] = [];
  while (!won(game.board)) {
    const next = moves(game.board).find(
      (move) => move.to.zone === "foundation" && move.from.zone === "tableau",
    );
    if (!next) return null;
    plan.push(next);
    game = apply(game, next);
  }
  return plan;
}

export function assertBoard(value: unknown): asserts value is Board {
  const board = value as Board;
  if (
    !board ||
    !Array.isArray(board.tableau) ||
    board.tableau.length !== 7 ||
    !Array.isArray(board.foundations) ||
    board.foundations.length !== 4 ||
    !Array.isArray(board.stock) ||
    !Array.isArray(board.waste) ||
    ![1, 3].includes(board.draw) ||
    !Number.isSafeInteger(board.moves) ||
    board.moves < 0
  )
    throw Error("Invalid board");
  const piles = [
    ...board.tableau,
    ...board.foundations,
    board.stock,
    board.waste,
  ];
  if (piles.some((pile) => !Array.isArray(pile))) throw Error("Invalid piles");
  const cards = piles.flat();
  if (
    cards.length !== 52 ||
    new Set(cards.map((card) => card?.id)).size !== 52 ||
    cards.some(
      (card) =>
        !card ||
        !SUITS.includes(card.suit) ||
        !Number.isInteger(card.rank) ||
        card.rank < 1 ||
        card.rank > 13 ||
        card.id !== `${card.suit}-${card.rank}` ||
        typeof card.faceUp !== "boolean",
    )
  )
    throw Error("Invalid deck");
  if (
    board.stock.some((card) => card.faceUp) ||
    board.waste.some((card) => !card.faceUp)
  )
    throw Error("Invalid card visibility");
  board.foundations.forEach((pile, pileIndex) => {
    if (
      pile.some(
        (card, index) =>
          !card.faceUp ||
          card.suit !== SUITS[pileIndex] ||
          card.rank !== index + 1,
      )
    )
      throw Error("Invalid foundation");
  });
  board.tableau.forEach((pile) => {
    if (pile.length && !pile.at(-1)!.faceUp) throw Error("Covered tableau top");
    let open = false;
    pile.forEach((card, index) => {
      if (
        open &&
        (!card.faceUp ||
          pile[index - 1].rank !== card.rank + 1 ||
          red(pile[index - 1]) === red(card))
      )
        throw Error("Invalid tableau sequence");
      open ||= card.faceUp;
    });
  });
}

export const serialize = (game: Game) => JSON.stringify(game);

export function restore(raw: string | null): Game | null {
  try {
    if (!raw) return null;
    const game = JSON.parse(raw) as Game;
    if (
      game.version !== 2 ||
      !Number.isSafeInteger(game.elapsed) ||
      game.elapsed < 0 ||
      !Number.isSafeInteger(game.seed) ||
      game.seed < 0 ||
      !Number.isSafeInteger(game.undos) ||
      game.undos < 0 ||
      typeof game.winRecorded !== "boolean" ||
      !Array.isArray(game.history)
    )
      return null;
    assertBoard(game.board);
    game.history.forEach(assertBoard);
    if (
      game.history.length !== game.board.moves ||
      game.history.some(
        (board, index) =>
          board.moves !== index || board.draw !== game.board.draw,
      )
    )
      return null;
    return game;
  } catch {
    return null;
  }
}
