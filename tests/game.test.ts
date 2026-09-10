import { describe, it, expect } from "vitest";
import {
  apply,
  assertBoard,
  autoPlan,
  canMove,
  clone,
  hint,
  moves,
  newGame,
  restore,
  serialize,
  SUITS,
  undo,
  won,
  type Card,
  type Game,
  type Source,
} from "../src/game";
const card = (suit: Card["suit"], rank: number, faceUp = true): Card => ({
  id: `${suit}-${rank}`,
  suit,
  rank,
  faceUp,
});
function fixture(
  tableau: Card[][] = [],
  foundations: Card[][] = [[], [], [], []],
): Game {
  const g = newGame();
  const used = new Set(
    [...tableau.flat(), ...foundations.flat()].map((c) => c.id),
  );
  g.board.tableau = Array.from({ length: 7 }, (_, i) => tableau[i] || []);
  g.board.foundations = foundations;
  g.board.stock = SUITS.flatMap((s) =>
    Array.from({ length: 13 }, (_, i) => card(s, i + 1, false)),
  ).filter((c) => !used.has(c.id));
  assertBoard(g.board);
  return g;
}
const from = (pile: number, index = 0): Source => ({
  zone: "tableau",
  pile,
  index,
});
const to = (pile: number) => ({ zone: "tableau" as const, pile });
describe("Косынка", () => {
  it("раздаёт 52 уникальные карты, 7 столбцов и 24 карты в колоде", () => {
    const g = newGame();
    expect(g.board.tableau.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.board.tableau.flat().filter((c) => c.faceUp)).toHaveLength(7);
    expect(g.board.stock).toHaveLength(24);
    assertBoard(g.board);
  });
  it("разрешает убывание с чередованием цвета и перенос последовательности", () => {
    const g = fixture([
      [card("spades", 9), card("hearts", 8)],
      [card("diamonds", 10)],
      [card("clubs", 10)],
      [card("hearts", 11)],
    ]);
    expect(canMove(g.board, from(0), to(1))).toBe(true);
    expect(canMove(g.board, from(0), to(2))).toBe(false);
    expect(canMove(g.board, from(0), to(3))).toBe(false);
    const next = apply(g, { type: "move", from: from(0), to: to(1) });
    expect(next.board.tableau[1].map((c) => c.rank)).toEqual([10, 9, 8]);
    expect(g.board.tableau[0]).toHaveLength(2);
  });
  it("пустой столбец принимает только короля и цепочку с королём", () => {
    const g = fixture([
      [card("hearts", 13), card("clubs", 12)],
      [card("spades", 9)],
    ]);
    expect(canMove(g.board, from(0), to(2))).toBe(true);
    expect(canMove(g.board, from(1), to(2))).toBe(false);
  });
  it("запрещает закрытые карты, неверные индексы и перенос в себя", () => {
    const g = fixture([[card("clubs", 4, false), card("hearts", 3)]]);
    expect(canMove(g.board, from(0), to(1))).toBe(false);
    expect(canMove(g.board, from(0, -1), to(1))).toBe(false);
    expect(canMove(g.board, from(0, 1), to(0))).toBe(false);
  });
  it("собирает основание по масти от туза, запрещает цепочки", () => {
    const g = fixture([
      [card("hearts", 1)],
      [card("hearts", 2)],
      [card("spades", 2), card("diamonds", 1)],
    ]);
    const target = { zone: "foundation" as const, pile: 1 };
    expect(canMove(g.board, from(1), target)).toBe(false);
    expect(canMove(g.board, from(0), { ...target, pile: 0 })).toBe(false);
    const next = apply(g, { type: "move", from: from(0), to: target });
    expect(canMove(next.board, from(1), target)).toBe(true);
    expect(canMove(g.board, from(2), { ...target, pile: 0 })).toBe(false);
  });
  it("открывает освободившуюся карту; отмена восстанавливает переворот и ход", () => {
    const g = fixture([[card("clubs", 5, false), card("hearts", 1)]]);
    const next = apply(g, {
      type: "move",
      from: from(0, 1),
      to: { zone: "foundation", pile: 1 },
    });
    expect(next.board.tableau[0][0].faceUp).toBe(true);
    expect(next.board.moves).toBe(1);
    expect(undo(next)).toEqual(g);
  });
  it.each([1, 3] as const)(
    "раздаёт по %s, повторяет без ограничений и отменяет раздачу/повтор",
    (draw) => {
      let g = newGame(draw);
      const original = clone(g);
      const first = apply(g, { type: "draw" });
      expect(first.board.waste.length).toBe(draw);
      expect(undo(first)).toEqual(g);
      for (let cycle = 0; cycle < 4; cycle++) {
        for (let i = 0; i < 24 / draw; i++) g = apply(g, { type: "draw" });
        const before = g;
        g = apply(g, { type: "draw" });
        expect(undo(g)).toEqual(before);
        expect(g.board.stock).toEqual(original.board.stock);
        expect(g.board.waste).toEqual([]);
      }
    },
  );
  it("из сброса можно взять только верхнюю карту; неполная тройка доступна", () => {
    let g = fixture([[card("hearts", 13)]]);
    g.board.draw = 3;
    // Remove one card from the 51-card stock by moving it legally onto an empty foundation.
    const ace = g.board.stock.findIndex((c) => c.id === "spades-1");
    g.board.foundations[0].push({
      ...g.board.stock.splice(ace, 1)[0],
      faceUp: true,
    });
    for (let i = 0; i < 17; i++) g = apply(g, { type: "draw" });
    expect(g.board.stock).toHaveLength(0);
    expect(g.board.waste).toHaveLength(50);
    expect(canMove(g.board, { zone: "waste", pile: 0, index: 0 }, to(1))).toBe(
      false,
    );
  });
  it("сохраняет партию и всю историю; отвергает повреждённые данные", () => {
    const g = apply(apply(newGame(3), { type: "draw" }), { type: "draw" });
    expect(restore(serialize(g))).toEqual(g);
    expect(undo(restore(serialize(g))!)).toEqual(undo(g));
    expect(restore("{oops")).toBeNull();
    const bad = clone(g);
    bad.board.stock[0] = bad.board.stock[1];
    expect(restore(serialize(bad))).toBeNull();
    expect(restore(JSON.stringify({ ...g, version: 99 }))).toBeNull();
    expect(restore(JSON.stringify({ ...g, elapsed: -1 }))).toBeNull();
  });
  it("недопустимое действие не меняет состояние и историю", () => {
    const g = newGame();
    expect(apply(g, { type: "move", from: from(99), to: to(0) })).toBe(g);
    expect(undo(g)).toBe(g);
  });
  it("автосбор доказывает решение и достигает победы", () => {
    const foundations = SUITS.map((s) =>
      Array.from({ length: 12 }, (_, i) => card(s, i + 1)),
    );
    const g = fixture(
      SUITS.map((s) => [card(s, 13)]),
      foundations,
    );
    const plan = autoPlan(g.board);
    expect(plan).toHaveLength(4);
    const result = plan!.reduce(apply, g);
    expect(won(result.board)).toBe(true);
    expect(undo(result).board.foundations.flat()).toHaveLength(51);
    expect(autoPlan(newGame().board)).toBeNull();
  });
  it("автосбор не предлагается при открытой, но заблокированной позиции", () => {
    const g = fixture([
      [card("spades", 2), card("hearts", 1)],
      [card("hearts", 2), card("spades", 1)],
    ]);
    expect(autoPlan(g.board)).toBeNull();
  });
  it("подсказка предлагает допустимый ход", () => {
    const g = fixture([[card("spades", 1)]]);
    expect(hint(g.board)).toEqual({
      type: "move",
      from: from(0),
      to: { zone: "foundation", pile: 0 },
    });
  });
  it("сохраняет целостность при 500 действиях и при полной отмене", () => {
    let seed = 172;
    const random = () =>
      (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    let g = newGame(3, random);
    const original = clone(g);
    for (let i = 0; i < 500; i++) {
      const options = moves(g.board);
      g =
        options.length && random() > 0.25
          ? apply(g, options[Math.floor(random() * options.length)])
          : apply(g, { type: "draw" });
      assertBoard(g.board);
    }
    expect(restore(serialize(g))).toEqual(g);
    while (g.history.length) g = undo(g);
    expect(g).toEqual(original);
  });
});
