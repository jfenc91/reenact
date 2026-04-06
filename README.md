[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@jfenc91/reenact)](https://www.npmjs.com/package/@jfenc91/reenact)

# reenact

A CLI tool that records browser videos from YAML scripts. Built for AI agents that need to generate demo videos of UI changes.

[Website](https://jfenc91.github.io/reenact/)

## Install

```bash
npm install -g @jfenc91/reenact
```

Chromium is downloaded automatically on install (~200MB). If needed, run manually:

```bash
npx playwright install chromium
```

## Quick start

Create `demo.yaml`:

```yaml
url: https://example.com
steps:
  - wait: 1s
  - click: "h1"
  - scroll: down
  - wait: 2s
```

Run it:

```bash
reenact demo.yaml -o demo.webm
```

## Action reference

| Action | Usage | Description |
|---|---|---|
| `click` | `- click: "#btn"` | Smooth mouse move to element, then click |
| `type` | `- type:` with `selector`, `text`, `wpm` | Type character by character at natural speed (default 70 wpm) |
| `hover` | `- hover: ".menu"` | Move cursor over an element without clicking |
| `scroll` | `- scroll: down` | Smooth scroll; accepts `direction` and `amount` (px) |
| `wait` | `- wait: 2s` or `- wait: "#el"` | Pause for a duration or wait for a selector |
| `wait_for` | `- wait_for:` with `selector`, `state`, `timeout` | Wait for element state: `visible`, `attached`, `hidden`, `detached` |
| `navigate` / `goto` | `- navigate: https://example.com` | Navigate to a URL |
| `key` / `press` | `- key: Enter` | Press a key or combo (`Control+A`) |
| `fill` | `- fill:` with `selector`, `text` | Instantly fill a field (non-humanized) |
| `select` | `- select:` with `selector`, `value` | Choose a `<select>` dropdown value |
| `clear` | `- clear: "#input"` | Clear an input field |
| `screenshot` | `- screenshot: out.png` | Capture a screenshot mid-recording |
| `back` | `- back` | Go back in browser history |
| `forward` | `- forward` | Go forward in browser history |
| `reload` | `- reload` | Reload the page |
| `move_to` | `- move_to:` with `x`, `y`, `duration` | Move cursor to coordinates with bezier motion |

## Script options

Top-level YAML keys that configure the recording environment.

| Key | Default | Description |
|---|---|---|
| `url` | -- | Starting URL before steps begin |
| `viewport.width` | `1920` | Browser viewport width in pixels |
| `viewport.height` | `1080` | Browser viewport height in pixels |
| `color_scheme` | `no-preference` | `light`, `dark`, or `no-preference` |
| `locale` | `en-US` | Browser locale string |
| `user_agent` | Chromium default | Custom user-agent string |
| `ignore_https_errors` | `false` | Skip TLS certificate validation |

## CLI flags

| Flag | Description |
|---|---|
| `-o, --output <path>` | Output video path (default: `<script>.webm`) |
| `--headed` | Show the browser window while recording |
| `--slow-mo <ms>` | Add extra delay to every Playwright action |

## Use with Claude Code skills

You can use reenact inside a [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code) to automatically record and share UI demos. For example, a PR review skill that records the changes and posts the video as a comment.

Create a `.reenact/demo.yaml` in your repo to define a demo script:

```yaml
url: http://localhost:3000
viewport:
  width: 1280
  height: 720
steps:
  - wait: 1s
  - click: ".new-feature-button"
  - wait: 2s
  - scroll: down
```

Then in your skill, run:

```bash
reenact .reenact/demo.yaml -o demo.mp4
gh pr comment $PR_NUMBER --body "## Demo

$(cat <<'BODY'
Here is a recording of the changes:
BODY
)"
```

See [examples/skills/pr-demo.md](examples/skills/pr-demo.md) for a full PR demo skill.

## License

MIT
