import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
let page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
async function loadFixture(value) {
  await page.close();
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    (value) => localStorage.setItem("kosynka.game.v1", JSON.stringify(value)),
    value,
  );
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
}
const read = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("kosynka.game.v1")));
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Косынка", exact: true }).waitFor();
const initial = await read();
assert.equal(initial.board.stock.length, 24);
await page.getByRole("button", { name: "Взять карты из колоды" }).tap();
assert.equal((await read()).board.stock.length, 23);
await page.getByRole("button", { name: "Отменить", exact: true }).tap();
await page.waitForTimeout(220);
assert.deepEqual((await read()).board, initial.board);
await page.getByRole("button", { name: "Новая игра", exact: true }).tap();
await page.getByRole("button", { name: "По три Больше стратегии" }).tap();
await page.getByRole("button", { name: "Раздать карты" }).tap();
await page.getByRole("button", { name: "Взять карты из колоды" }).tap();
assert.equal((await read()).board.waste.length, 3);
const saved = await read();
await page.reload({ waitUntil: "networkidle" });
assert.deepEqual((await read()).board, saved.board);
await page.getByRole("button", { name: "Подсказка", exact: true }).tap();
assert.ok(await page.locator(".hinted").count());
await page.getByRole("button", { name: "Правила игры" }).tap();
await page.getByRole("heading", { name: "Как играть" }).waitFor();
await page.getByRole("button", { name: "Всё понятно" }).tap();
for (const width of [320, 375, 390, 768, 1280]) {
  await page.setViewportSize({ width, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    `overflow ${width}`,
  );
  const columns = await page.locator(".column").all();
  const last = await columns[6].boundingBox();
  assert.ok(last.x + last.width <= width, `column fits ${width}`);
}
await page.setViewportSize({ width: 390, height: 844 });
await fs.mkdir("test-results", { recursive: true });
await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
// Deterministic legitimate fixture: test taps, double taps, dragging, reveal, and undo.
const fixture = await page.evaluate(async () => {
  const { newGame, SUITS } = await import("/src/game.ts");
  const g = newGame();
  const c = (suit, rank, faceUp = true) => ({
    id: `${suit}-${rank}`,
    suit,
    rank,
    faceUp,
  });
  g.board.tableau = [
    [c("spades", 5, false), c("hearts", 1)],
    [c("hearts", 10)],
    [c("spades", 9), c("hearts", 8)],
    [c("clubs", 13)],
    [],
    [],
    [],
  ];
  const used = new Set(g.board.tableau.flat().map((c) => c.id));
  g.board.stock = SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => c(suit, i + 1, false)),
  ).filter((c) => !used.has(c.id));
  localStorage.setItem("kosynka.game.v1", JSON.stringify(g));
  return g;
});
await loadFixture(fixture);
await page
  .getByRole("button", { name: "9 пики", exact: true })
  .tap({ position: { x: 10, y: 10 } });
await page.getByRole("button", { name: "10 черви", exact: true }).tap();
assert.deepEqual(
  (await read()).board.tableau[1].map((c) => c.rank),
  [10, 9, 8],
);
await page.getByRole("button", { name: "Отменить", exact: true }).tap();
await page.waitForTimeout(220);
await page.getByRole("button", { name: "Т черви", exact: true }).dblclick();
assert.equal((await read()).board.foundations[1].length, 1);
assert.equal((await read()).board.tableau[0][0].faceUp, true);
await page.getByRole("button", { name: "Отменить", exact: true }).tap();
await page.waitForTimeout(220);
assert.deepEqual((await read()).board, fixture.board);
const src = await page
  .getByRole("button", { name: "9 пики", exact: true })
  .boundingBox();
const dst = await page
  .getByRole("button", { name: "10 черви", exact: true })
  .boundingBox();
await page.mouse.move(src.x + src.width / 2, src.y + 10);
await page.mouse.down();
await page.mouse.move(dst.x + dst.width / 2, dst.y + 20, { steps: 10 });
await page.mouse.up();
assert.deepEqual(
  (await read()).board.tableau[1].map((c) => c.rank),
  [10, 9, 8],
);
await page.getByRole("button", { name: "Отменить", exact: true }).tap();
await page.waitForTimeout(220);
// Real touch events exercise Pointer Events without scrolling the board.
const cdp = await context.newCDPSession(page);
const beforeScroll = await page.locator(".board").evaluate((e) => e.scrollTop);
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: src.x + 10, y: src.y + 10 }],
});
for (let i = 1; i <= 8; i++)
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        x: src.x + 10 + ((dst.x - src.x) * i) / 8,
        y: src.y + 10 + ((dst.y - src.y) * i) / 8,
      },
    ],
  });
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchEnd",
  touchPoints: [],
});
assert.deepEqual(
  (await read()).board.tableau[1].map((c) => c.rank),
  [10, 9, 8],
);
assert.equal(
  await page.locator(".board").evaluate((e) => e.scrollTop),
  beforeScroll,
);
await page.getByRole("button", { name: "Отменить", exact: true }).tap();
await page.waitForTimeout(220);
// Rejected drop preserves complete board.
await page.mouse.move(src.x + 10, src.y + 10);
await page.mouse.down();
await page.mouse.move(src.x + 80, src.y + 100, { steps: 8 });
await page.mouse.up();
assert.deepEqual((await read()).board, fixture.board);
// A final four-card position exercises actual animated collection and victory dialog.
const endgame = await page.evaluate(async () => {
  const { newGame, SUITS } = await import("/src/game.ts");
  const g = newGame();
  const c = (suit, rank) => ({
    id: `${suit}-${rank}`,
    suit,
    rank,
    faceUp: true,
  });
  g.board.stock = [];
  g.board.tableau = [...SUITS.map((s) => [c(s, 13)]), [], [], []];
  g.board.foundations = SUITS.map((s) =>
    Array.from({ length: 12 }, (_, i) => c(s, i + 1)),
  );
  return g;
});
await loadFixture(endgame);
await page.getByRole("button", { name: "Собрать в основания" }).tap();
await page.getByRole("heading", { name: "Красиво сыграно!" }).waitFor();
assert.equal((await read()).board.foundations.flat().length, 52);
assert.equal((await read()).board.moves, 4);
// A short Telegram-like viewport keeps controls and long sequences reachable.
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Новая игра", exact: true })
  .tap();
await page.setViewportSize({ width: 320, height: 480 });
await page.getByRole("button", { name: "Развернуть", exact: true }).tap();
await page.getByRole("button", { name: "Прокрутить столбцы вниз" }).tap();
await page.waitForTimeout(400);
assert.ok(await page.locator(".board").evaluate((e) => e.scrollTop > 0));
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
);
assert.deepEqual(errors, []);
console.log(
  "PASS: mobile draw/undo, draw-3, reload, hint/help, widths 320–1280, tap sequence, double tap/reveal, drag, invalid drop, auto-collection/victory. No runtime errors.",
);
await browser.close();
