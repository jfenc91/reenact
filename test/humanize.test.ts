import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// We need to import from source — tsx handles TS resolution
import {
  smoothMoveTo,
  humanType,
  humanClick,
  humanDoubleClick,
  humanRightClick,
  humanHover,
  humanScroll,
} from "../src/humanize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHTML = `file://${path.resolve(__dirname, "fixtures/test.html")}`;

// ---------- Pure-logic tests (no browser needed) ----------

describe("bezierPoints (via smoothMoveTo internals)", () => {
  // We can't import bezierPoints directly (not exported), so we test it
  // indirectly through smoothMoveTo behavior. For a direct unit test we
  // replicate the algorithm here to verify correctness.

  function bezierPoints(
    p0: [number, number],
    p1: [number, number],
    p2: [number, number],
    p3: [number, number],
    steps: number
  ): [number, number][] {
    const points: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const x =
        u ** 3 * p0[0] +
        3 * u ** 2 * t * p1[0] +
        3 * u * t ** 2 * p2[0] +
        t ** 3 * p3[0];
      const y =
        u ** 3 * p0[1] +
        3 * u ** 2 * t * p1[1] +
        3 * u * t ** 2 * p2[1] +
        t ** 3 * p3[1];
      points.push([x, y]);
    }
    return points;
  }

  it("generates correct number of points", () => {
    const pts = bezierPoints([0, 0], [10, 20], [30, 20], [40, 0], 20);
    assert.equal(pts.length, 21); // steps + 1
  });

  it("start point matches p0", () => {
    const pts = bezierPoints([5, 10], [10, 20], [30, 20], [40, 0], 10);
    assert.deepStrictEqual(pts[0], [5, 10]);
  });

  it("end point matches p3", () => {
    const pts = bezierPoints([5, 10], [10, 20], [30, 20], [40, 0], 10);
    const last = pts[pts.length - 1];
    assert.ok(Math.abs(last[0] - 40) < 1e-9, `expected x~40, got ${last[0]}`);
    assert.ok(Math.abs(last[1] - 0) < 1e-9, `expected y~0, got ${last[1]}`);
  });
});

// ---------- Browser-dependent tests ----------

describe("humanize browser interactions", () => {
  let browser: Browser;
  let page: Page;

  before(async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();
    await page.goto(fixtureHTML);
    // Initialize mouse tracking globals
    await page.evaluate(() => {
      (window as any)._mouseX = 0;
      (window as any)._mouseY = 0;
    });
  });

  after(async () => {
    await browser.close();
  });

  it("smoothMoveTo updates _mouseX/_mouseY on the page", async () => {
    await smoothMoveTo(page, 200, 150, 200);
    const pos = await page.evaluate(() => ({
      x: (window as any)._mouseX,
      y: (window as any)._mouseY,
    }));
    // Should be near 200,150 (end of bezier curve)
    assert.ok(Math.abs(pos.x - 200) < 5, `mouseX expected ~200, got ${pos.x}`);
    assert.ok(Math.abs(pos.y - 150) < 5, `mouseY expected ~150, got ${pos.y}`);
  });

  it("humanType types all characters into a focused element", async () => {
    // Clear the input first
    await page.fill("#input", "");
    await humanType(page, "#input", "hello", 200);
    const value = await page.inputValue("#input");
    assert.equal(value, "hello");
  });

  it("humanClick clicks within element bounds", async () => {
    await humanClick(page, "#btn", 200);
    const output = await page.textContent("#output");
    assert.equal(output, "clicked");
  });

  it("humanScroll scrolls the page", async () => {
    // Reset scroll position
    await page.evaluate(() => window.scrollTo(0, 0));
    const before = await page.evaluate(() => window.scrollY);
    await humanScroll(page, "down", 300, 300);
    // Allow a moment for scroll to settle
    await new Promise((r) => setTimeout(r, 100));
    const afterVal = await page.evaluate(() => window.scrollY);
    assert.ok(afterVal > before, `expected scroll > ${before}, got ${afterVal}`);
  });

  it("humanDoubleClick performs a double click", async () => {
    // Scroll back to top so button is visible
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 100));
    // Reset output
    await page.evaluate(() => {
      document.getElementById("output")!.textContent = "";
    });
    await humanDoubleClick(page, "#btn", 200);
    const output = await page.textContent("#output");
    assert.equal(output, "double-clicked");
  });

  it("humanRightClick performs a right click", async () => {
    // Scroll back to top so button is visible
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 100));
    // Reset output
    await page.evaluate(() => {
      document.getElementById("output")!.textContent = "";
    });
    await humanRightClick(page, "#btn", 200);
    const output = await page.textContent("#output");
    assert.equal(output, "right-clicked");
  });

  it("humanHover moves cursor without clicking", async () => {
    // Reset output to verify no click happens
    await page.evaluate(() => {
      document.getElementById("output")!.textContent = "unchanged";
    });
    await humanHover(page, "#btn", 200);
    const output = await page.textContent("#output");
    assert.equal(output, "unchanged");
    // Verify mouse moved near the button
    const btnBox = await page.locator("#btn").boundingBox();
    const pos = await page.evaluate(() => ({
      x: (window as any)._mouseX,
      y: (window as any)._mouseY,
    }));
    assert.ok(btnBox, "button bounding box should exist");
    assert.ok(
      pos.x >= btnBox!.x && pos.x <= btnBox!.x + btnBox!.width,
      `mouseX ${pos.x} should be within button x range`
    );
    assert.ok(
      pos.y >= btnBox!.y && pos.y <= btnBox!.y + btnBox!.height,
      `mouseY ${pos.y} should be within button y range`
    );
  });
});
