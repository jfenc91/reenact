[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

# reenact

Create videos of human-like web UI navigation from YAML scripts.

[Website](https://jfenc91.github.io/reenact/)

## Install

```bash
npm install -g reenact
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

## License

MIT
