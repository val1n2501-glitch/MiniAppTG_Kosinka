import { describe, expect, it } from "vitest";
import {
  apply,
  assertBoard,
  autoPlan,
  canMove,
  clone,
  hint,
  moves,
  newGame,
  restartGame,
  restore,
  serialize,
  SUITS,
  undo,
  won,
  type Card,
  type Game,
  type Source,
  type Target,
} from "../src/game";

const card = (suit: Card["suit"], rank: number, faceUp = true): Card => ({
  id: `${suit}-${rank}`,
  suit,
  rank,
  faceUp,
});
const tableauSource = (pile: number, index = 0): Source => ({
  zone: "tableau",
  pile,
  index,
});
const tableauTarget = (pile: number): Target => ({ zone: "tableau", pile });
const foundationTarget = (pile: number): Target => ({
  zone: "foundation",
  pile,
});

function fixture(
  tableau: Card[][] = [],
  foundations: Card[][] = [[], [], [], []],
  waste: Card[] = [],
  draw: 1 | 3 = 1,
): Game {
  const game = newGame(draw, 42);
  const used = new Set(
    [...tableau.flat(), ...foundations.flat(), ...waste].map((item) => item.id),
  );
  game.board.tableau = Array.from(
    { length: 7 },
    (_, index) => tableau[index] ?? [],
  );
  game.board.foundations = Array.from(
    { length: 4 },
    (_, index) => foundations[index] ?? [],
  );
  game.board.waste = waste.map((item) => ({ ...item, faceUp: true }));
  game.board.stock = SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, index) => card(suit, index + 1, false)),
  ).filter((item) => !used.has(item.id));
  assertBoard(game.board);
  return game;
}

function expectUndoBoard(game: Game, action: Parameters<typeof apply>[1]) {
  const next = apply(game, action);
  expect(next).not.toBe(game);
  const reverted = undo(next);
  expect(reverted.board).toEqual(game.board);
  expect(reverted.history).toEqual(game.history);
  expect(reverted.undos).toBe(game.undos + 1);
}

describe("создание партии", () => {
  it("создаёт ровно 52 уникальные карты", () => {
    const game = newGame(1, 100);
    const cards = [...game.board.tableau.flat(), ...game.board.stock];
    expect(cards).toHaveLength(52);
    expect(new Set(cards.map((item) => item.id))).toHaveLength(52);
    assertBoard(game.board);
  });

  it("раздаёт семь колонок 1–7 и открывает только верхние карты", () => {
    const game = newGame(1, 101);
    expect(game.board.tableau.map((pile) => pile.length)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    game.board.tableau.forEach((pile) => {
      expect(pile.slice(0, -1).every((item) => !item.faceUp)).toBe(true);
      expect(pile.at(-1)?.faceUp).toBe(true);
    });
    expect(game.board.stock).toHaveLength(24);
  });

  it("одинаковый seed создаёт одинаковую раздачу, другой seed — другую", () => {
    expect(newGame(3, 987654).board).toEqual(newGame(3, 987654).board);
    expect(newGame(3, 987654).board).not.toEqual(newGame(3, 987655).board);
  });

  it("перезапускает ту же раздачу и может сменить режим draw", () => {
    let game = newGame(1, 991);
    game = apply(game, { type: "draw" });
    const restarted = restartGame(game, 3);
    expect(restarted.seed).toBe(991);
    expect(restarted.board.draw).toBe(3);
    expect(restarted.board.tableau).toEqual(newGame(3, 991).board.tableau);
    expect(restarted.board.moves).toBe(0);
  });
});

describe("tableau", () => {
  it("разрешает убывание с чередованием цвета", () => {
    const game = fixture([
      [card("spades", 9)],
      [card("diamonds", 10)],
      [card("clubs", 10)],
      [card("hearts", 8)],
    ]);
    expect(canMove(game.board, tableauSource(0), tableauTarget(1))).toBe(true);
    expect(canMove(game.board, tableauSource(0), tableauTarget(2))).toBe(false);
    expect(canMove(game.board, tableauSource(0), tableauTarget(3))).toBe(false);
  });

  it("переносит правильно собранную последовательность целиком", () => {
    const game = fixture([
      [card("spades", 9), card("hearts", 8), card("clubs", 7)],
      [card("diamonds", 10)],
    ]);
    const next = apply(game, {
      type: "move",
      from: tableauSource(0),
      to: tableauTarget(1),
    });
    expect(next.board.tableau[0]).toEqual([]);
    expect(next.board.tableau[1].map((item) => item.rank)).toEqual([
      10, 9, 8, 7,
    ]);
  });

  it("пустая колонка принимает только короля или цепочку с королём", () => {
    const game = fixture([
      [card("hearts", 13), card("clubs", 12)],
      [card("spades", 12)],
    ]);
    expect(canMove(game.board, tableauSource(0), tableauTarget(2))).toBe(true);
    expect(canMove(game.board, tableauSource(0, 1), tableauTarget(2))).toBe(
      false,
    );
    expect(canMove(game.board, tableauSource(1), tableauTarget(2))).toBe(false);
  });

  it("не позволяет переносить закрытую карту, неверный индекс и карту в ту же стопку", () => {
    const game = fixture([[card("clubs", 4, false), card("hearts", 3)]]);
    expect(canMove(game.board, tableauSource(0), tableauTarget(1))).toBe(false);
    expect(canMove(game.board, tableauSource(0, -1), tableauTarget(1))).toBe(
      false,
    );
    expect(canMove(game.board, tableauSource(0, 1), tableauTarget(0))).toBe(
      false,
    );
  });

  it("автоматически открывает верхнюю закрытую карту и отменяет оба изменения", () => {
    const game = fixture([[card("clubs", 5, false), card("hearts", 1)]]);
    const action = {
      type: "move" as const,
      from: tableauSource(0, 1),
      to: foundationTarget(1),
    };
    const next = apply(game, action);
    expect(next.board.tableau[0][0].faceUp).toBe(true);
    expectUndoBoard(game, action);
  });
});

describe("foundation и waste", () => {
  it("строит foundation одной мастью от туза до короля", () => {
    const game = fixture([
      [card("hearts", 1)],
      [card("hearts", 2)],
      [card("spades", 1)],
    ]);
    expect(canMove(game.board, tableauSource(1), foundationTarget(1))).toBe(
      false,
    );
    expect(canMove(game.board, tableauSource(0), foundationTarget(1))).toBe(
      true,
    );
    expect(canMove(game.board, tableauSource(2), foundationTarget(1))).toBe(
      false,
    );
    const withAce = apply(game, {
      type: "move",
      from: tableauSource(0),
      to: foundationTarget(1),
    });
    expect(canMove(withAce.board, tableauSource(1), foundationTarget(1))).toBe(
      true,
    );
  });

  it("переносит foundation → tableau и отменяет ход", () => {
    const foundations = [[card("spades", 1)], [], [], []];
    const game = fixture([[card("hearts", 2)]], foundations);
    const action = {
      type: "move" as const,
      from: { zone: "foundation" as const, pile: 0, index: 0 },
      to: tableauTarget(0),
    };
    expect(canMove(game.board, action.from, action.to)).toBe(true);
    expectUndoBoard(game, action);
  });

  it("переносит верхнюю карту waste → tableau", () => {
    const game = fixture([[card("spades", 8)]], undefined, [
      card("diamonds", 7),
    ]);
    const action = {
      type: "move" as const,
      from: { zone: "waste" as const, pile: 0, index: 0 },
      to: tableauTarget(0),
    };
    expect(canMove(game.board, action.from, action.to)).toBe(true);
    expectUndoBoard(game, action);
  });

  it("переносит верхнюю карту waste → foundation", () => {
    const game = fixture([], undefined, [card("diamonds", 1)]);
    const action = {
      type: "move" as const,
      from: { zone: "waste" as const, pile: 0, index: 0 },
      to: foundationTarget(2),
    };
    const next = apply(game, action);
    expect(next.board.foundations[2]).toEqual([card("diamonds", 1)]);
    expectUndoBoard(game, action);
  });

  it("из waste доступна только последняя карта", () => {
    const game = fixture(
      [[card("spades", 8)]],
      undefined,
      [card("diamonds", 7), card("hearts", 6)],
      3,
    );
    expect(
      canMove(
        game.board,
        { zone: "waste", pile: 0, index: 0 },
        tableauTarget(0),
      ),
    ).toBe(false);
  });
});

describe("stock, draw и undo", () => {
  it("Draw 1 открывает одну карту и отменяется", () => {
    const game = newGame(1, 4);
    const next = apply(game, { type: "draw" });
    expect(next.board.stock).toHaveLength(23);
    expect(next.board.waste).toHaveLength(1);
    expect(next.board.waste[0].faceUp).toBe(true);
    expectUndoBoard(game, { type: "draw" });
  });

  it("Draw 3 открывает три карты и корректно обрабатывает остаток", () => {
    let game = newGame(3, 5);
    for (let index = 0; index < 7; index++)
      game = apply(game, { type: "draw" });
    expect(game.board.stock).toHaveLength(3);
    game = apply(game, { type: "draw" });
    expect(game.board.stock).toHaveLength(0);
    expect(game.board.waste).toHaveLength(24);
  });

  it.each([1, 3] as const)(
    "повторяет колоду без ограничения в режиме Draw %s",
    (draw) => {
      let game = newGame(draw, 6);
      const originalStock = clone(game.board.stock);
      const draws = Math.ceil(24 / draw);
      for (let cycle = 0; cycle < 3; cycle++) {
        for (let index = 0; index < draws; index++)
          game = apply(game, { type: "draw" });
        const beforeRecycle = game;
        game = apply(game, { type: "draw" });
        expect(game.board.stock).toEqual(originalStock);
        expect(game.board.waste).toEqual([]);
        expect(undo(game).board).toEqual(beforeRecycle.board);
      }
    },
  );

  it("пустые stock и waste не создают ход", () => {
    const game = newGame(1, 8);
    game.board.stock = [];
    game.board.waste = [];
    game.board.foundations = SUITS.map((suit) =>
      Array.from({ length: 13 }, (_, index) => card(suit, index + 1)),
    );
    game.board.tableau = [[], [], [], [], [], [], []];
    expect(apply(game, { type: "draw" })).toBe(game);
  });
});

describe("сохранение, подсказки и завершение", () => {
  it("восстанавливает полную историю, seed, отмены и таймер", () => {
    let game = apply(newGame(3, 123), { type: "draw" });
    game = { ...undo(game), elapsed: 77 };
    expect(restore(serialize(game))).toEqual(game);
  });

  it("отвергает повреждённое и несовместимое сохранение", () => {
    const game = newGame(1, 10);
    expect(restore("{oops")).toBeNull();
    expect(restore(JSON.stringify({ ...game, version: 1 }))).toBeNull();
    expect(restore(JSON.stringify({ ...game, elapsed: -1 }))).toBeNull();
    const duplicate = clone(game);
    duplicate.board.stock[0] = duplicate.board.stock[1];
    expect(restore(serialize(duplicate))).toBeNull();
  });

  it("определяет победу только при четырёх полных foundations", () => {
    const game = fixture(
      [],
      SUITS.map((suit) =>
        Array.from({ length: 13 }, (_, index) => card(suit, index + 1)),
      ),
    );
    expect(won(game.board)).toBe(true);
    game.board.foundations[0].pop();
    expect(won(game.board)).toBe(false);
  });

  it("автосбор строит проверенный план и достигает победы", () => {
    const foundations = SUITS.map((suit) =>
      Array.from({ length: 12 }, (_, index) => card(suit, index + 1)),
    );
    const game = fixture(
      SUITS.map((suit) => [card(suit, 13)]),
      foundations,
    );
    const plan = autoPlan(game.board);
    expect(plan).toHaveLength(4);
    expect(won(plan!.reduce(apply, game).board)).toBe(true);
    expect(autoPlan(newGame(1, 3).board)).toBeNull();
  });

  it("не запускает автосбор для открытой, но заблокированной позиции", () => {
    const game = fixture([
      [card("spades", 2), card("hearts", 1)],
      [card("hearts", 2), card("spades", 1)],
    ]);
    expect(autoPlan(game.board)).toBeNull();
  });

  it("подсказка предлагает разрешённый полезный ход", () => {
    const game = fixture([[card("spades", 1)]]);
    const action = hint(game.board);
    expect(action).toEqual({
      type: "move",
      from: tableauSource(0),
      to: foundationTarget(0),
    });
    expect(
      action?.type === "move" && canMove(game.board, action.from, action.to),
    ).toBe(true);
  });

  it("сохраняет целостность после 500 действий и полной серии undo", () => {
    let randomState = 172;
    const random = () =>
      (randomState = (randomState * 1664525 + 1013904223) >>> 0) / 4294967296;
    let game = newGame(3, 172);
    const originalBoard = clone(game.board);
    for (let index = 0; index < 500; index++) {
      const options = moves(game.board);
      game =
        options.length && random() > 0.25
          ? apply(game, options[Math.floor(random() * options.length)])
          : apply(game, { type: "draw" });
      assertBoard(game.board);
    }
    expect(restore(serialize(game))).toEqual(game);
    while (game.history.length) game = undo(game);
    expect(game.board).toEqual(originalBoard);
    expect(game.undos).toBe(500);
  });
});
