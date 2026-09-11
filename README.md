# Sloposcopulus

A floating, always-on-top desktop widget that tracks your AI usage — tokens, spend, and quota meters — for Claude, ChatGPT, Gemini, GitHub Copilot, and any custom agent. Runs locally as a native macOS app (Tauri v2 + React).

## Features

- **Floating widget** — pinned over every window, draggable, resizable (260×150 to 760×900), with a compact one-line mode.
- **Usage meters** — segmented Daily / Weekly / Monthly quota bars, no login wall; fully simulated out of the box.
- **Live tracking** — real provider APIs via native Rust connectors (Anthropic, OpenAI, GitHub Copilot). API keys are stored locally in your app-data dir and never leave the device.
- **Spend + token chart** — a minimal "usage peak" chart per agent, revealed behind a single button.
- **Appearance** — dark frosted glass or light iPhone-widget style with a solid tint drawn from the active agent's color.

## Screenshots

_Add screenshots: `screenshots/dark.png`, `screenshots/light.png`, `screenshots/compact.png`._

## Development

Requires Rust (stable), Node 18+, and the Tauri v2 system deps for macOS (Xcode CLT).

```sh
npm install
npm run tauri dev     # hot-reload debug build
```

Frontend and Rust checks:

```sh
npx tsc --noEmit
npm run build
cargo build --bins    # from repo root (Cargo workspace)
```

### Project layout

```
src/                 React widget (App, tags/agents, meters, chart, settings)
src-tauri/           Tauri shell
  src/connectors.rs  Provider connectors + local API-key store
  src/lib.rs         Command plumbing, tray, always-on-top
  tauri.conf.json    Window, packaging, CSP
```

## How it works

- The widget simulates usage out of the box so it just works with no setup.
- Add a real API key in **Settings → API keys** and the matching agent switches to live/estimated data; every meter row and the footer state the data source (official, estimated, or simulated).
- Usage state, keys, and settings live only in your user data directory — local-first by design.

## License

MIT