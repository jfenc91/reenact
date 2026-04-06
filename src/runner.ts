/**
 * Execute a parsed uivid script against a browser page.
 */

import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  humanClick,
  humanDoubleClick,
  humanRightClick,
  humanType,
  humanHover,
  humanScroll,
  smoothMoveTo,
} from "./humanize.js";

// Use a string expression for page.evaluate to avoid esbuild's keepNames
// transform injecting __name() calls that don't exist in the browser context.
const INJECT_CURSOR_SCRIPT = `
  if (!document.getElementById("__reenact_cursor")) {
    if (window._mouseX === undefined) window._mouseX = 0;
    if (window._mouseY === undefined) window._mouseY = 0;

    var style = document.createElement("style");
    style.textContent = [
      "* { cursor: none !important; }",
      "#__reenact_cursor { position: fixed; top: 0; left: 0; width: 20px; height: 24px; pointer-events: none; z-index: 999999; will-change: transform; }",
      "#__reenact_click_ripple { position: fixed; top: 0; left: 0; width: 0; height: 0; pointer-events: none; z-index: 999998; border-radius: 50%; border: 2px solid rgba(0,120,255,0.7); opacity: 0; will-change: transform, opacity, width, height; }",
      "#__reenact_click_ripple.active { animation: __reenact_ripple 0.4s ease-out forwards; }",
      "@keyframes __reenact_ripple { 0% { width: 0; height: 0; opacity: 0.8; } 100% { width: 40px; height: 40px; opacity: 0; } }"
    ].join("\\n");
    document.head.appendChild(style);

    var cursor = document.createElement("div");
    cursor.id = "__reenact_cursor";
    cursor.innerHTML = '<svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 1L2 18L6.5 13.5L10.5 22L13.5 20.5L9.5 12L16 12L2 1Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);

    var ripple = document.createElement("div");
    ripple.id = "__reenact_click_ripple";
    document.body.appendChild(ripple);

    (function loop() {
      var x = window._mouseX || 0;
      var y = window._mouseY || 0;
      cursor.style.transform = "translate(" + x + "px, " + y + "px)";
      requestAnimationFrame(loop);
    })();

    window.addEventListener("__reenact_click", function() {
      var x = window._mouseX || 0;
      var y = window._mouseY || 0;
      ripple.style.transform = "translate(" + (x - 20) + "px, " + (y - 20) + "px)";
      ripple.classList.remove("active");
      void ripple.offsetWidth;
      ripple.classList.add("active");
    });
  }
`;

async function injectCursor(page: Page): Promise<void> {
  await page.evaluate(INJECT_CURSOR_SCRIPT);
}

export interface Script {
  name?: string;
  url?: string;
  viewport?: { width?: number; height?: number };
  color_scheme?: "light" | "dark" | "no-preference";
  locale?: string;
  user_agent?: string;
  ignore_https_errors?: boolean;
  steps: Step[];
}

type Step = string | Record<string, any>;

function parseDuration(val: string | number): number {
  if (typeof val === "number") return val * 1000;
  const m = String(val)
    .trim()
    .match(/^([\d.]+)\s*(ms|s|m)?$/);
  if (!m) throw new Error(`Invalid duration: ${val}`);
  const num = parseFloat(m[1]);
  const unit = m[2] || "s";
  if (unit === "ms") return num;
  if (unit === "m") return num * 60000;
  return num * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const KNOWN_ACTIONS = new Set([
  "navigate", "goto", "click", "double_click", "right_click", "type",
  "hover", "scroll", "wait", "wait_for", "select", "key", "press",
  "screenshot", "fill", "clear", "back", "forward", "reload", "move_to",
]);

export function normalizeStep(step: Step): Record<string, any> {
  if (typeof step === "string") {
    const parts = step.split(/\s+(.+)/);
    return { [parts[0]]: parts[1] ?? null };
  }
  return step as Record<string, any>;
}

export function describeStep(step: Step): string {
  const obj = normalizeStep(step);
  const action = Object.keys(obj)[0];
  const params = obj[action];

  switch (action) {
    case "navigate":
    case "goto": {
      const url = typeof params === "string" ? params : params?.url;
      return `${action} \u2192 ${url}`;
    }
    case "click":
    case "double_click":
    case "right_click":
    case "hover":
    case "clear": {
      const sel = typeof params === "string" ? params : params?.selector;
      return `${action} \u2192 ${sel}`;
    }
    case "type": {
      if (typeof params === "string") {
        return `type \u2192 :focus "${params}"`;
      }
      const sel = params?.selector || params?.into || ":focus";
      const text = params?.text || "";
      const wpm = params?.wpm || 70;
      return `type \u2192 ${sel} "${text}" @ ${wpm} wpm`;
    }
    case "scroll": {
      if (typeof params === "string") return `scroll \u2192 ${params}`;
      if (!params) return "scroll \u2192 down";
      return `scroll \u2192 ${params.direction || "down"} ${params.amount || 300}px`;
    }
    case "wait": {
      if (typeof params === "string" && !/^[\d.]/.test(params)) {
        return `wait \u2192 ${params}`;
      }
      return `wait \u2192 ${params}`;
    }
    case "wait_for": {
      const sel = typeof params === "string" ? params : params?.selector;
      return `wait_for \u2192 ${sel}`;
    }
    case "select": {
      return `select \u2192 ${params?.selector} = "${params?.value}"`;
    }
    case "key":
    case "press": {
      const key = typeof params === "string" ? params : params?.key;
      return `${action} \u2192 ${key}`;
    }
    case "screenshot": {
      const p = typeof params === "string" ? params : params?.path || "screenshot.png";
      return `screenshot \u2192 ${p}`;
    }
    case "fill": {
      return `fill \u2192 ${params?.selector} "${params?.text}"`;
    }
    case "back":
      return "back";
    case "forward":
      return "forward";
    case "reload":
      return "reload";
    case "move_to": {
      return `move_to \u2192 (${params?.x}, ${params?.y})`;
    }
    default:
      return `${action} \u2192 ${JSON.stringify(params)}`;
  }
}

function stepToYaml(step: Step): string {
  if (typeof step === "string") return step;
  const action = Object.keys(step)[0];
  const params = (step as Record<string, any>)[action];
  if (params === null || params === undefined) return action;
  if (typeof params === "string" || typeof params === "number") {
    return `${action}: ${params}`;
  }
  return `${action}: ${JSON.stringify(params)}`;
}

async function runStep(page: Page, step: Step): Promise<void> {
  // Normalize string shorthand into object form
  if (typeof step === "string") {
    const parts = step.split(/\s+(.+)/);
    step = { [parts[0]]: parts[1] ?? null };
  }

  if (typeof step !== "object" || !step) {
    throw new Error(`Invalid step: ${JSON.stringify(step)}`);
  }

  const action = Object.keys(step)[0];
  const params = step[action];

  switch (action) {
    case "navigate":
    case "goto": {
      const url = typeof params === "string" ? params : params.url;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await injectCursor(page);
      await sleep(500);
      break;
    }

    case "click": {
      const selector = typeof params === "string" ? params : params.selector;
      await humanClick(page, selector);
      break;
    }

    case "double_click": {
      const selector = typeof params === "string" ? params : params.selector;
      await humanDoubleClick(page, selector);
      break;
    }

    case "right_click": {
      const selector = typeof params === "string" ? params : params.selector;
      await humanRightClick(page, selector);
      break;
    }

    case "type": {
      if (typeof params === "string") {
        await humanType(page, ":focus", params);
      } else {
        const selector = params.selector || params.into;
        const text = params.text;
        const wpm = params.wpm || 70;
        await humanType(page, selector, text, wpm);
      }
      break;
    }

    case "hover": {
      const selector = typeof params === "string" ? params : params.selector;
      await humanHover(page, selector);
      break;
    }

    case "scroll": {
      if (typeof params === "string") {
        await humanScroll(page, params as "up" | "down");
      } else if (!params) {
        await humanScroll(page);
      } else {
        await humanScroll(
          page,
          params.direction || "down",
          params.amount || 300
        );
      }
      break;
    }

    case "wait": {
      if (typeof params === "string" && !/^[\d.]/.test(params)) {
        await page.waitForSelector(params, { timeout: 30000 });
      } else {
        await sleep(parseDuration(params));
      }
      break;
    }

    case "wait_for": {
      if (typeof params === "string") {
        await page.waitForSelector(params, { timeout: 30000 });
      } else {
        await page.waitForSelector(params.selector, {
          state: params.state || "visible",
          timeout: parseDuration(params.timeout || "30s"),
        });
      }
      break;
    }

    case "select": {
      if (typeof params === "object") {
        await page.selectOption(params.selector, params.value);
      } else {
        throw new Error("select requires selector and value");
      }
      break;
    }

    case "key":
    case "press": {
      const key = typeof params === "string" ? params : params.key;
      await page.keyboard.press(key);
      await sleep(200);
      break;
    }

    case "screenshot": {
      const p =
        typeof params === "string" ? params : params?.path || "screenshot.png";
      await page.screenshot({ path: p });
      break;
    }

    case "fill": {
      if (typeof params === "object") {
        await page.fill(params.selector, params.text);
      } else {
        throw new Error("fill requires selector and text");
      }
      break;
    }

    case "clear": {
      const selector = typeof params === "string" ? params : params.selector;
      await page.fill(selector, "");
      break;
    }

    case "back":
      await page.goBack({ waitUntil: "domcontentloaded" });
      await injectCursor(page);
      await sleep(300);
      break;

    case "forward":
      await page.goForward({ waitUntil: "domcontentloaded" });
      await injectCursor(page);
      await sleep(300);
      break;

    case "reload":
      await page.reload({ waitUntil: "domcontentloaded" });
      await injectCursor(page);
      await sleep(500);
      break;

    case "move_to": {
      if (typeof params === "object" && params.x !== undefined) {
        await smoothMoveTo(page, params.x, params.y, params.duration || 400);
      } else {
        throw new Error("move_to requires x and y");
      }
      break;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

export interface RunOptions {
  outputPath?: string;
  headless?: boolean;
  slowMo?: number;
}

export async function runScript(
  script: Script,
  options: RunOptions = {}
): Promise<string> {
  const {
    outputPath = "output.webm",
    headless = true,
    slowMo = 0,
  } = options;

  const width = script.viewport?.width ?? 1920;
  const height = script.viewport?.height ?? 1080;

  const tmpDir = fs.mkdtempSync("/tmp/reenact_");

  const browser = await chromium.launch({
    headless,
    slowMo,
    args: [
      "--enable-webgl",
      "--enable-webgl2-compute-context",
      "--enable-accelerated-2d-canvas",
      "--disable-web-security",
      "--allow-running-insecure-content",
    ],
  });

  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: tmpDir, size: { width, height } },
    colorScheme: script.color_scheme || "no-preference",
    locale: script.locale || "en-US",
    userAgent: script.user_agent || undefined,
    ignoreHTTPSErrors: script.ignore_https_errors || false,
  });

  const page = await context.newPage();

  // Initialize mouse tracking and inject visible cursor
  await page.evaluate(() => {
    (window as any)._mouseX = 0;
    (window as any)._mouseY = 0;
  });
  await injectCursor(page);

  // Navigate to starting URL
  if (script.url) {
    await page.goto(script.url, { waitUntil: "domcontentloaded" });
    await injectCursor(page);
    await sleep(500);
  }

  // Execute steps
  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];
    const desc = describeStep(step);
    try {
      await runStep(page, step);
      console.log(` \u2713 ${desc}`);
    } catch (e: any) {
      console.log(` \u2717 ${desc}`);
      throw new Error(`Step ${i + 1} failed (${stepToYaml(step)}): ${e.message}`);
    }
  }

  await sleep(500);

  // Close context to finalize the video
  const video = page.video();
  await context.close();
  await browser.close();

  // Move video to output path
  if (video) {
    const videoPath = await video.path();
    if (videoPath && fs.existsSync(videoPath)) {
      const outDir = path.dirname(path.resolve(outputPath));
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      const wantsMp4 = outputPath.toLowerCase().endsWith(".mp4");

      if (wantsMp4) {
        // Convert WebM to MP4 using ffmpeg
        const webmPath = path.join(tmpDir, "source.webm");
        fs.copyFileSync(videoPath, webmPath);

        try {
          execSync("ffmpeg -version", { stdio: "ignore" });
        } catch {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          throw new Error(
            "ffmpeg is not installed. Install it to produce MP4 output:\n" +
              "  macOS:  brew install ffmpeg\n" +
              "  Ubuntu: sudo apt install ffmpeg\n" +
              "Or use .webm output instead (no extra dependency needed)."
          );
        }

        try {
          execSync(
            `ffmpeg -y -i ${JSON.stringify(webmPath)} -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -an ${JSON.stringify(path.resolve(outputPath))}`,
            { stdio: "pipe" }
          );
        } catch (e: any) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          throw new Error(`ffmpeg conversion failed: ${e.stderr?.toString() || e.message}`);
        }
      } else {
        fs.copyFileSync(videoPath, outputPath);
      }
    }
  }

  // Clean up temp dir
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return outputPath;
}
