import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "../src/cli.ts");
const FIXTURES = path.resolve(__dirname, "fixtures");

function runCli(
  args: string[],
  options: { timeout?: number } = {}
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(
      "node",
      ["--import", "tsx", CLI, ...args],
      {
        encoding: "utf-8",
        timeout: options.timeout || 60000,
        cwd: FIXTURES,
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
      }
    );
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() || "",
      stderr: err.stderr?.toString() || "",
      exitCode: err.status ?? 1,
    };
  }
}

describe("CLI: --help", () => {
  it("exits 0 and prints usage", () => {
    const result = runCli(["--help"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Usage/i);
    assert.match(result.stdout, /reenact/);
  });
});

describe("CLI: --version", () => {
  it("exits 0 and prints version", () => {
    const result = runCli(["--version"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /0\.1\.0/);
  });
});

describe("CLI: --dry-run", () => {
  it("with valid YAML exits 0 and prints step descriptions", () => {
    const result = runCli([
      path.join(FIXTURES, "simple.yaml"),
      "--dry-run",
    ]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /wait/);
    assert.match(result.stdout, /scroll/);
  });

  it("with invalid action exits 1", () => {
    const result = runCli([
      path.join(FIXTURES, "invalid_action.yaml"),
      "--dry-run",
    ]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /unknown action/);
  });
});

describe("CLI: error handling", () => {
  it("missing script file exits 1 with error", () => {
    const result = runCli(["nonexistent.yaml"]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /file not found|Error/i);
  });

  it("YAML without steps key exits 1 with error", () => {
    const result = runCli([path.join(FIXTURES, "no_steps.yaml")]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /steps/i);
  });
});

describe("CLI: video output", () => {
  const tmpDir = fs.mkdtempSync("/tmp/reenact_cli_test_");

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("running a basic script produces a .webm file", { timeout: 30000 }, () => {
    const output = path.join(tmpDir, "cli_test.webm");
    const result = runCli(
      [path.join(FIXTURES, "simple.yaml"), "-o", output],
      { timeout: 30000 }
    );
    assert.equal(result.exitCode, 0, `CLI failed: ${result.stderr}`);
    assert.ok(fs.existsSync(output), "webm file should exist");
    const stat = fs.statSync(output);
    assert.ok(stat.size > 0, "webm file should be non-empty");
  });
});
