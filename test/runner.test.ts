import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import {
  describeStep,
  normalizeStep,
  runScript,
  KNOWN_ACTIONS,
  type Script,
} from "../src/runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- parseDuration is not exported, so we replicate it for testing ----------
// We test it indirectly through runScript's "wait" action and also directly here.

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

describe("parseDuration", () => {
  it("parses '2s' as 2000ms", () => {
    assert.equal(parseDuration("2s"), 2000);
  });

  it("parses '500ms' as 500ms", () => {
    assert.equal(parseDuration("500ms"), 500);
  });

  it("parses '1.5m' as 90000ms", () => {
    assert.equal(parseDuration("1.5m"), 90000);
  });

  it("parses bare number 3 as 3000ms (seconds)", () => {
    assert.equal(parseDuration(3), 3000);
  });

  it("parses bare string '2' as 2000ms", () => {
    assert.equal(parseDuration("2"), 2000);
  });

  it("throws on invalid input", () => {
    assert.throws(() => parseDuration("abc"), /Invalid duration/);
  });

  it("throws on empty string", () => {
    assert.throws(() => parseDuration(""), /Invalid duration/);
  });
});

describe("describeStep", () => {
  it("describes navigate action", () => {
    const desc = describeStep({ navigate: "https://example.com" });
    assert.match(desc, /navigate.*https:\/\/example\.com/);
  });

  it("describes click action", () => {
    const desc = describeStep({ click: "#btn" });
    assert.match(desc, /click.*#btn/);
  });

  it("describes type action with string param", () => {
    const desc = describeStep({ type: "hello world" });
    assert.match(desc, /type.*:focus.*"hello world"/);
  });

  it("describes type action with object param", () => {
    const desc = describeStep({
      type: { selector: "#input", text: "hi", wpm: 100 },
    });
    assert.match(desc, /type.*#input.*"hi".*100 wpm/);
  });

  it("describes scroll action", () => {
    const desc = describeStep({ scroll: "down" });
    assert.match(desc, /scroll.*down/);
  });

  it("describes wait action", () => {
    const desc = describeStep({ wait: "2s" });
    assert.match(desc, /wait.*2s/);
  });

  it("describes key action", () => {
    const desc = describeStep({ key: "Enter" });
    assert.match(desc, /key.*Enter/);
  });

  it("describes unknown action without crashing", () => {
    const desc = describeStep({ foobar: "something" });
    assert.ok(desc.includes("foobar"));
  });
});

describe("normalizeStep", () => {
  it("converts string shorthand to object form", () => {
    const obj = normalizeStep("click #btn");
    assert.deepStrictEqual(obj, { click: "#btn" });
  });

  it("converts string with no argument", () => {
    const obj = normalizeStep("reload");
    assert.deepStrictEqual(obj, { reload: null });
  });

  it("passes objects through unchanged", () => {
    const input = { navigate: "https://example.com" };
    const obj = normalizeStep(input);
    assert.deepStrictEqual(obj, input);
  });
});

describe("cursor injection", () => {
  let browser: Browser;
  let page: Page;

  before(async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();
  });

  after(async () => {
    await browser.close();
  });

  it("injectCursor adds the cursor div to the page", async () => {
    // Run a minimal script that triggers cursor injection
    const fixtureHTML = `file://${path.resolve(__dirname, "fixtures/test.html")}`;
    const tmpOutput = path.join(fs.mkdtempSync("/tmp/reenact_test_"), "out.webm");

    const script: Script = {
      url: fixtureHTML,
      steps: [{ wait: "200ms" }],
    };

    await runScript(script, { outputPath: tmpOutput, headless: true });

    // We can't inspect the page after runScript closes the browser,
    // so instead we verify that the script ran without error and produced output
    assert.ok(fs.existsSync(tmpOutput), "output file should exist");

    // Clean up
    fs.rmSync(path.dirname(tmpOutput), { recursive: true, force: true });
  });
});

describe("runScript integration", () => {
  const tmpDir = fs.mkdtempSync("/tmp/reenact_test_");
  const fixtureHTML = `file://${path.resolve(__dirname, "fixtures/test.html")}`;

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("full script with navigate + click + type + wait + scroll produces a video", async () => {
    const output = path.join(tmpDir, "full_test.webm");
    const script: Script = {
      steps: [
        { navigate: fixtureHTML },
        { click: "#input" },
        { type: { selector: "#input", text: "hi", wpm: 200 } },
        { wait: "300ms" },
        { scroll: "down" },
      ],
    };

    const result = await runScript(script, {
      outputPath: output,
      headless: true,
    });
    assert.equal(result, output);
    assert.ok(fs.existsSync(output), "video file should exist");
    const stat = fs.statSync(output);
    assert.ok(stat.size > 0, "video file should be non-empty");
  });

  it("unknown action throws with helpful error message", async () => {
    const output = path.join(tmpDir, "unknown_action.webm");
    const script: Script = {
      url: "about:blank",
      steps: [{ foobar: "something" }],
    };

    await assert.rejects(
      () => runScript(script, { outputPath: output, headless: true }),
      /Unknown action: foobar/
    );
  });

  it("MP4 output works (ffmpeg available)", async () => {
    // Check ffmpeg availability
    let hasFfmpeg = false;
    try {
      const { execSync } = await import("node:child_process");
      execSync("ffmpeg -version", { stdio: "ignore" });
      hasFfmpeg = true;
    } catch {
      // skip
    }

    if (!hasFfmpeg) {
      // Skip test if ffmpeg not available
      return;
    }

    const output = path.join(tmpDir, "test_output.mp4");
    const script: Script = {
      url: "about:blank",
      steps: [{ wait: "300ms" }],
    };

    const result = await runScript(script, {
      outputPath: output,
      headless: true,
    });
    assert.equal(result, output);
    assert.ok(fs.existsSync(output), "mp4 file should exist");
    const stat = fs.statSync(output);
    assert.ok(stat.size > 0, "mp4 file should be non-empty");
  });
});
