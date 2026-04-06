/**
 * Human-like interaction behaviors: smooth mouse movement, natural typing, etc.
 */

import type { Page } from "playwright";

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function smoothMoveTo(
  page: Page,
  x: number,
  y: number,
  durationMs = 400
): Promise<void> {
  const current = await page.evaluate(() => ({
    x: (window as any)._mouseX || 0,
    y: (window as any)._mouseY || 0,
  }));
  const sx = current.x;
  const sy = current.y;

  const dist = Math.hypot(x - sx, y - sy);
  if (dist < 5) {
    await page.mouse.move(x, y);
    return;
  }

  const midX = (sx + x) / 2;
  const midY = (sy + y) / 2;
  const spread = Math.min(dist * 0.3, 100);

  const cp1: [number, number] = [
    sx + (midX - sx) * 0.3 + rand(-spread, spread),
    sy + (midY - sy) * 0.3 + rand(-spread, spread),
  ];
  const cp2: [number, number] = [
    x - (x - midX) * 0.3 + rand(-spread, spread),
    y - (y - midY) * 0.3 + rand(-spread, spread),
  ];

  const steps = Math.max(15, Math.floor(dist / 8));
  const points = bezierPoints([sx, sy], cp1, cp2, [x, y], steps);
  const stepDelay = durationMs / steps;

  for (const [px, py] of points) {
    await page.mouse.move(px, py);
    await page.evaluate(
      ([mx, my]) => {
        (window as any)._mouseX = mx;
        (window as any)._mouseY = my;
      },
      [px, py]
    );
    await sleep(stepDelay * rand(0.7, 1.3));
  }
}

export async function humanType(
  page: Page,
  selector: string,
  text: string,
  wpm = 70
): Promise<void> {
  const element = page.locator(selector);
  await element.click();
  await sleep(rand(100, 300));

  const baseDelay = 60000 / (wpm * 5); // ms per character

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    await page.keyboard.type(char);

    let delay = baseDelay * rand(0.5, 1.8);
    if (char === " ") {
      delay *= rand(1.2, 2.5);
    } else if (i > 0 && text[i - 1] === " ") {
      delay *= rand(1.0, 1.5);
    }
    // Occasional micro-pause
    if (Math.random() < 0.03) {
      delay += rand(200, 600);
    }

    await sleep(delay);
  }
}

export async function humanClick(
  page: Page,
  selector: string,
  durationMs = 400
): Promise<void> {
  const element = page.locator(selector).first();
  const box = await element.boundingBox();
  if (!box) {
    await element.click();
    return;
  }

  const tx = box.x + box.width * rand(0.3, 0.7);
  const ty = box.y + box.height * rand(0.3, 0.7);

  await smoothMoveTo(page, tx, ty, durationMs);
  await sleep(rand(50, 150));
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("__reenact_click"));
  });
  await page.mouse.click(tx, ty);
  await sleep(rand(100, 300));
}

export async function humanDoubleClick(
  page: Page,
  selector: string,
  durationMs = 400
): Promise<void> {
  const element = page.locator(selector).first();
  const box = await element.boundingBox();
  if (!box) {
    await element.dblclick();
    return;
  }

  const tx = box.x + box.width * rand(0.3, 0.7);
  const ty = box.y + box.height * rand(0.3, 0.7);

  await smoothMoveTo(page, tx, ty, durationMs);
  await sleep(rand(50, 150));
  await page.mouse.dblclick(tx, ty);
  await sleep(rand(100, 300));
}

export async function humanRightClick(
  page: Page,
  selector: string,
  durationMs = 400
): Promise<void> {
  const element = page.locator(selector).first();
  const box = await element.boundingBox();
  if (!box) {
    await element.click({ button: "right" });
    return;
  }

  const tx = box.x + box.width * rand(0.3, 0.7);
  const ty = box.y + box.height * rand(0.3, 0.7);

  await smoothMoveTo(page, tx, ty, durationMs);
  await sleep(rand(50, 150));
  await page.mouse.click(tx, ty, { button: "right" });
  await sleep(rand(100, 300));
}

export async function humanScroll(
  page: Page,
  direction: "up" | "down" = "down",
  amount = 300,
  durationMs = 600
): Promise<void> {
  const delta = direction === "down" ? amount : -amount;
  const steps = Math.floor(rand(8, 15));
  const perStep = delta / steps;
  const stepDelay = durationMs / steps;

  for (let i = 0; i < steps; i++) {
    const jitter = perStep * rand(0.7, 1.3);
    await page.mouse.wheel(0, jitter);
    await sleep(stepDelay * rand(0.6, 1.4));
  }
}

export async function humanHover(
  page: Page,
  selector: string,
  durationMs = 400
): Promise<void> {
  const element = page.locator(selector).first();
  const box = await element.boundingBox();
  if (!box) return;

  const tx = box.x + box.width * rand(0.3, 0.7);
  const ty = box.y + box.height * rand(0.3, 0.7);
  await smoothMoveTo(page, tx, ty, durationMs);
  await sleep(rand(200, 500));
}
