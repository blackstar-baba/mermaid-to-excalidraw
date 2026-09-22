import { test, expect, Page } from "@playwright/test";

// Mermaid 12:
//  - measures labels with real-browser DOM (foreignObject starts at 0x0 in
//    jsdom), so self-loop geometry cannot be asserted under the jsdom unit
//    tests;
//  - renders self relations as a loop on the side of the node (v11 routed
//    them around the bottom with 3 segmented paths).
// This spec verifies the geometric contract in a real browser.

const SELF_LOOP_CODE = `classDiagram
    class Snake {
      +Integer length
    }
    Snake "1" -- "1" Snake : eats`;

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto("/?pw");
  await page.waitForFunction(() => (window as any).__HARNESS_READY__);
});

test.afterAll(async () => {
  await page.close();
});

test("self relation renders as a side loop with both multiplicities", async () => {
  const result = await page.evaluate(async (code) => {
    const graph = await (window as any).parseMermaid(code);
    const { elements } = (window as any).graphToExcalidraw(graph);
    const snake = elements.find(
      (el: any) => el.type === "rectangle" && el.id === "Snake"
    );
    const loop = elements.find(
      (el: any) =>
        el.type === "arrow" &&
        el.label?.text === "eats" &&
        el.start?.id === "Snake" &&
        el.end?.id === "Snake"
    );
    const mults = elements
      .filter((el: any) => el.type === "text" && el.text === "1")
      .map((el: any) => ({ x: el.x, y: el.y }));

    const absolutePoints: Array<[number, number]> = (loop.points ?? []).map(
      ([x, y]: [number, number]) => [x + loop.x, y + loop.y]
    );

    return {
      snake: {
        x: snake.x,
        y: snake.y,
        width: snake.width,
        height: snake.height,
      },
      loopPoints: absolutePoints,
      multiplicities: mults,
    };
  }, SELF_LOOP_CODE);

  const { snake, loopPoints, multiplicities } = result;
  const xs = loopPoints.map(([x]) => x);
  const ys = loopPoints.map(([, y]) => y);

  // one merged arrow describing the loop
  expect(loopPoints.length).toBeGreaterThanOrEqual(4);
  // no repeated consecutive points
  expect(
    loopPoints.some(
      ([x, y], i) =>
        i > 0 && x === loopPoints[i - 1][0] && y === loopPoints[i - 1][1]
    )
  ).toBe(false);
  // the loop bulges outside the rectangle on at least one side
  expect(
    Math.min(...xs) < snake.x ||
      Math.max(...xs) > snake.x + snake.width ||
      Math.max(...ys) > snake.y + snake.height ||
      Math.min(...ys) < snake.y
  ).toBe(true);
  // multiplicities emitted once each, at least one placed outside the box
  expect(multiplicities).toHaveLength(2);
  expect(
    multiplicities.some(
      (m) =>
        m.x < snake.x ||
        m.x > snake.x + snake.width ||
        m.y > snake.y + snake.height
    )
  ).toBe(true);
});
