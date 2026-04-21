# Print Farm Companion — Desktop Shell

Tauri v2 shell that wraps the SvelteKit web app in a native window. Phase 1 scaffold only: shows the site, injects `window.__IS_DESKTOP__ = true`, toggles between dev (`localhost:5173`) and release (`printfarmcompanion.pages.dev`) based on the build profile.

## One-time setup

1. **Install Rust**: https://rustup.rs
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
2. **Install Tauri CLI**:
   ```bash
   cargo install tauri-cli --version "^2.0"
   ```
3. **macOS build deps** (Xcode Command Line Tools):
   ```bash
   xcode-select --install
   ```
4. **Generate icons** (one-time). Drop a 1024×1024 PNG at `desktop/src-tauri/icons/app-icon.png`, then:
   ```bash
   cd desktop/src-tauri && cargo tauri icon icons/app-icon.png
   ```
   Until this is done, `cargo tauri build` will fail on the icon step; `cargo tauri dev` still works.

## Run

From the repo root:

```bash
npm run desktop:dev     # starts SvelteKit on :5173 AND opens the Tauri window
npm run desktop:build   # produces a .app / .dmg in desktop/src-tauri/target/release/bundle/
```

The dev command runs `npm run dev` in the background (via `beforeDevCommand`) so you don't need a second terminal.

## Verify Phase 1

1. `npm run desktop:dev` — window opens showing the SvelteKit UI.
2. In the webview (right-click → Inspect Element if enabled, or via DevTools): `window.__IS_DESKTOP__` should be `true`.
3. Release build loads `printfarmcompanion.pages.dev` instead of localhost (confirmed by `cfg!(debug_assertions)` in `src/lib.rs`).

## What's next

Phases 2–4 (file-handler sidecar, direct Bambu MQTT, local file cache) are planned in `/Users/linus/.claude/plans/ok-lets-make-a-deep-treehouse.md`.
