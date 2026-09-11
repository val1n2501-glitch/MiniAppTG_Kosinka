import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const URL = process.env.SMOKE_URL || "http://localhost:5173/";
const GAME_KEY = "kosynka.game.v2";
const STATS_KEY = "kosynka.statistics.v1";
const browser = await chromium.launch({ headless: true });
const runtimeErrors = [];

async function createPage(viewport, mobile = false) {
  const context = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
  });
  await context.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    window.__gameSaveWrites = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === "kosynka.game.v2") window.__gameSaveWrites++;
      return setItem.call(this, key, value);
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  return { context, page };
}

const read = (page, key = GAME_KEY) =>
  page.evaluate(
    (storageKey) => JSON.parse(localStorage.getItem(storageKey)),
    key,
  );

async function loadFixture(context, value, viewport) {
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: GAME_KEY, value },
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.setViewportSize(viewport);
  await page.goto(URL, { waitUntil: "networkidle" });
  return page;
}

await fs.mkdir("test-results", { recursive: true });

// Desktop: load, draw, undo, settings, new game, reload and responsive layout.
const desktop = await createPage({ width: 1280, height: 820 });
let page = desktop.page;
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Косынка" }).waitFor();
await page.waitForTimeout(100);
const writesBeforeTimer = await page.evaluate(() => window.__gameSaveWrites);
await page.waitForTimeout(2100);
assert.notEqual(
  await page.locator(".game-status strong").first().innerText(),
  "00:00",
);
assert.equal(
  await page.evaluate(() => window.__gameSaveWrites),
  writesBeforeTimer,
  "timer must not serialize the full game every second",
);
let game = await read(page);
assert.equal(game.version, 2);
assert.equal(game.board.stock.length, 24);
await page.getByRole("button", { name: "Взять карты из колоды" }).click();
assert.equal((await read(page)).board.stock.length, 23);
await page.getByRole("button", { name: "Отменить" }).click();
assert.equal((await read(page)).board.stock.length, 24);
assert.equal((await read(page)).undos, 1);

await page
  .getByRole("button", { name: "Настройки", exact: true })
  .last()
  .click();
await page.getByRole("heading", { name: "Настройки" }).waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: "test-results/settings.png", fullPage: true });
await page.getByText("Звук", { exact: true }).click();
await page.getByRole("radio", { name: "По три · сложнее" }).click();
assert.equal(
  await page.evaluate(
    () => JSON.parse(localStorage.getItem("kosynka.settings.v1")).sound,
  ),
  false,
);
await page
  .getByRole("button", { name: "Применить и начать новую партию" })
  .click();
await page.waitForTimeout(750);
game = await read(page);
assert.equal(game.board.draw, 3);
const savedSeed = game.seed;
await page.getByRole("button", { name: "Взять карты из колоды" }).click();
assert.equal((await read(page)).board.waste.length, 3);
const saved = await read(page);
await page.reload({ waitUntil: "networkidle" });
assert.deepEqual((await read(page)).board, saved.board);
assert.equal((await read(page)).seed, savedSeed);
await page.getByRole("button", { name: "Новая игра" }).click();
await page.getByRole("button", { name: "Начать эту раздачу заново" }).click();
assert.equal((await read(page)).seed, savedSeed);
assert.equal((await read(page)).board.moves, 0);
assert.equal((await read(page, STATS_KEY)).draw3.abandoned, 1);
await page.waitForTimeout(750);

for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 850 },
  { width: 768, height: 900 },
  { width: 1024, height: 768 },
  { width: 1280, height: 820 },
  { width: 1680, height: 950 },
  { width: 844, height: 390 },
]) {
  await page.setViewportSize(viewport);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    `horizontal overflow at ${viewport.width}x${viewport.height}`,
  );
  const lastPile = await page.locator(".tableau-pile").last().boundingBox();
  assert.ok(
    lastPile && lastPile.x + lastPile.width <= viewport.width,
    `tableau fits at ${viewport.width}x${viewport.height}`,
  );
  assert.ok(
    await page.locator(".new-game-button").isVisible(),
    `new game remains visible at ${viewport.width}x${viewport.height}`,
  );
  if (viewport.width === 844 && viewport.height === 390)
    await page.screenshot({
      path: "test-results/landscape.png",
      fullPage: true,
    });
}
await page.setViewportSize({ width: 1280, height: 820 });
await page.screenshot({ path: "test-results/desktop.png", fullPage: true });

// Controlled position: click sequence, double click, reveal, valid/invalid drag and full undo.
const fixture = await page.evaluate(async () => {
  const { newGame, SUITS } = await import("/src/game.ts");
  const value = newGame(1, 700);
  const c = (suit, rank, faceUp = true) => ({
    id: `${suit}-${rank}`,
    suit,
    rank,
    faceUp,
  });
  value.board.tableau = [
    [c("clubs", 5, false), c("hearts", 1)],
    [c("hearts", 10)],
    [c("spades", 9), c("hearts", 8)],
    [c("clubs", 13)],
    [],
    [],
    [],
  ];
  const used = new Set(value.board.tableau.flat().map((card) => card.id));
  value.board.stock = SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, index) => c(suit, index + 1, false)),
  ).filter((card) => !used.has(card.id));
  return value;
});
await desktop.context.close();
const fixtureContext = await browser.newContext({
  viewport: { width: 1280, height: 820 },
});
page = await loadFixture(fixtureContext, fixture, {
  width: 1280,
  height: 820,
});

await page
  .getByRole("button", { name: "9 пики" })
  .click({ position: { x: 10, y: 10 } });
assert.equal(
  await page.locator(".is-allowed, .drop-check").count(),
  0,
  "selecting a card must not reveal valid destinations",
);
await page.getByRole("button", { name: "10 черви" }).click();
assert.deepEqual(
  (await read(page)).board.tableau[1].map((card) => card.rank),
  [10, 9, 8],
);
await page.getByRole("button", { name: "Отменить" }).click();
await page.waitForTimeout(220);
await page.getByRole("button", { name: "Т черви" }).dblclick();
assert.equal((await read(page)).board.foundations[1].length, 1);
assert.equal((await read(page)).board.tableau[0][0].faceUp, true);
await page.getByRole("button", { name: "Отменить" }).click();
await page.waitForTimeout(220);
assert.deepEqual((await read(page)).board, fixture.board);

const source = await page.getByRole("button", { name: "9 пики" }).boundingBox();
const destination = await page
  .getByRole("button", { name: "10 черви" })
  .boundingBox();
assert.ok(source && destination);
await page.mouse.move(source.x + 10, source.y + 10);
await page.mouse.down();
await page.mouse.move(
  destination.x + destination.width / 2,
  destination.y + 20,
  { steps: 10 },
);
await page.mouse.up();
assert.deepEqual(
  (await read(page)).board.tableau[1].map((card) => card.rank),
  [10, 9, 8],
);
await page.getByRole("button", { name: "Отменить" }).click();
await page.waitForTimeout(220);
await page.mouse.move(source.x + 10, source.y + 10);
await page.mouse.down();
await page.mouse.move(source.x + 160, source.y + 100, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(220);
assert.deepEqual((await read(page)).board, fixture.board);

// Mobile touch on both required viewports.
for (const viewport of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
]) {
  const mobile = await createPage(viewport, true);
  await mobile.page.close();
  const mobilePage = await loadFixture(mobile.context, fixture, viewport);
  await mobilePage.getByRole("button", { name: "Подсказка" }).click();
  assert.equal(await mobilePage.locator(".is-source-hint").count(), 1);
  assert.equal(await mobilePage.locator(".is-target-hint").count(), 1);
  assert.match(await mobilePage.locator(".notice").innerText(), /Подсказка:/);
  if (viewport.width === 390)
    await mobilePage.screenshot({
      path: "test-results/hint-mobile.png",
      fullPage: true,
    });
  const from = await mobilePage
    .getByRole("button", { name: "9 пики" })
    .boundingBox();
  const to = await mobilePage
    .getByRole("button", { name: "10 черви" })
    .boundingBox();
  assert.ok(from && to);
  const cdp = await mobile.context.newCDPSession(mobilePage);
  const startScroll = await mobilePage
    .locator(".game-board")
    .evaluate((element) => element.scrollTop);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x + 8, y: from.y + 8 }],
  });
  for (let step = 1; step <= 9; step++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + 8 + ((to.x - from.x) * step) / 9,
          y: from.y + 8 + ((to.y - from.y) * step) / 9,
        },
      ],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.deepEqual(
    (await read(mobilePage)).board.tableau[1].map((card) => card.rank),
    [10, 9, 8],
  );
  assert.equal(
    await mobilePage
      .locator(".game-board")
      .evaluate((element) => element.scrollTop),
    startScroll,
  );
  if (viewport.width === 390)
    await mobilePage.screenshot({
      path: "test-results/mobile.png",
      fullPage: true,
    });
  await mobile.context.close();
}

// A long tableau remains reachable in a short phone viewport.
const longGame = structuredClone(fixture);
const longCards = [
  ["hearts", 13],
  ["clubs", 12],
  ["diamonds", 11],
  ["spades", 10],
  ["hearts", 9],
  ["clubs", 8],
  ["diamonds", 7],
  ["spades", 6],
  ["hearts", 5],
  ["clubs", 4],
  ["diamonds", 3],
  ["spades", 2],
  ["hearts", 1],
].map(([suit, rank]) => ({ id: `${suit}-${rank}`, suit, rank, faceUp: true }));
longGame.board.tableau = [longCards, [], [], [], [], [], []];
longGame.board.foundations = [[], [], [], []];
longGame.board.waste = [];
const usedLong = new Set(longCards.map((card) => card.id));
longGame.board.stock = ["spades", "hearts", "diamonds", "clubs"]
  .flatMap((suit) =>
    Array.from({ length: 13 }, (_, index) => ({
      id: `${suit}-${index + 1}`,
      suit,
      rank: index + 1,
      faceUp: false,
    })),
  )
  .filter((card) => !usedLong.has(card.id));
longGame.board.moves = 0;
longGame.history = [];
const shortPhone = await createPage({ width: 320, height: 480 }, true);
await shortPhone.page.close();
const longPage = await loadFixture(shortPhone.context, longGame, {
  width: 320,
  height: 480,
});
assert.ok(
  await longPage
    .locator(".game-board")
    .evaluate((element) => element.scrollHeight > element.clientHeight),
);
await longPage
  .locator(".game-board")
  .evaluate((element) => element.scrollTo(0, element.scrollHeight));
await longPage
  .getByRole("button", { name: "Т черви" })
  .scrollIntoViewIfNeeded();
assert.ok(await longPage.getByRole("button", { name: "Т черви" }).isVisible());
await longPage.screenshot({
  path: "test-results/long-tableau.png",
  fullPage: true,
});
await shortPhone.context.close();

// Controlled victory: auto-complete, victory stats, local statistics and next game.
const endgame = await page.evaluate(async () => {
  const { newGame, SUITS } = await import("/src/game.ts");
  const value = newGame(1, 900);
  const c = (suit, rank) => ({
    id: `${suit}-${rank}`,
    suit,
    rank,
    faceUp: true,
  });
  value.board.stock = [];
  value.board.waste = [];
  value.board.tableau = [...SUITS.map((suit) => [c(suit, 13)]), [], [], []];
  value.board.foundations = SUITS.map((suit) =>
    Array.from({ length: 12 }, (_, index) => c(suit, index + 1)),
  );
  value.elapsed = 75;
  return value;
});
await fixtureContext.close();
const victoryContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
page = await loadFixture(victoryContext, endgame, {
  width: 390,
  height: 844,
});
await page.getByRole("heading", { name: "Победа!" }).waitFor({ timeout: 6000 });
assert.equal((await read(page)).board.foundations.flat().length, 52);
assert.equal((await read(page)).winRecorded, true);
const statistics = await read(page, STATS_KEY);
assert.equal(statistics.draw1.wins, 1);
assert.equal(statistics.draw1.bestTime >= 75, true);
await page.screenshot({ path: "test-results/victory.png", fullPage: true });
await page.getByRole("button", { name: "Сыграть ещё" }).click();
await page.waitForTimeout(100);
assert.equal((await read(page)).board.moves, 0);
assert.notEqual((await read(page)).seed, endgame.seed);

assert.deepEqual(runtimeErrors, []);
console.log(
  "PASS: desktop, 10 responsive viewports, Draw 1/3, settings, reload, click/double-click, mouse drag, rejected drag, touch drag at 375/390, auto-complete, victory and statistics. No runtime errors.",
);
await victoryContext.close();
await browser.close();
