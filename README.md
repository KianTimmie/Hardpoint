# Hardpoint

An open-source mod manager and community hub for **DCS World**.

- **Desktop app** (Windows; Tauri + Rust): installs, updates and removes mods without leaving
  debris, backs up anything a mod replaces, refuses clashing mods, and re-applies mods that a DCS
  update undid.
- **Hub website** (static, GitHub Pages): browse and search mods; "Install with Hardpoint" buttons
  open the app through `hardpoint://` links.
- **Mod index**: one JSON file per mod in `index/mods/`, submitted by pull request. Both the website
  and the app read the compiled `index.json`. The hub links to authors' own downloads; it hosts
  nothing.
- **CLI** (`hardpoint.exe`): the same engine for scripting and dedicated servers.

> Working name. "DCS World" is a trademark of Eagle Dynamics SA; this project is not affiliated with them.

## Status

Working prototype (v0.1). What's been verified:

| Piece | State |
|---|---|
| Install engine (`crates/hardpoint-core`) | 19 tests passing: deploy/undeploy, backups, conflicts, DCS-update repair, crash recovery, zip-slip, 7z, folders |
| CLI | End-to-end tested against a local hub: dependencies, 12 MB download with checksum, manual-download matching |
| Desktop app | Compiles; launched on Linux/WebKit and installed a mod from a `hardpoint://` link through the real UI |
| Hub site | Builds as a static site; responsive; light and dark |
| Windows installer | Produced by the `Release` workflow (not built locally) |

Before going public: replace `OWNER` (search the repo) with the GitHub org/user, push, enable
GitHub Pages (Settings → Pages → GitHub Actions), and the app's default index URL becomes
`https://OWNER.github.io/hardpoint/index.json`.

## Repository layout

```
crates/hardpoint-core   Rust engine: paths, archives, layout detection, deploy, hub client
crates/hardpoint-cli    `hardpoint` command-line tool
apps/desktop            Tauri app (src-tauri = Rust shell, src = React UI, with a browser demo mode)
apps/hub                Static hub website (React + Vite)
index/                  The mod index: schema, mods/*.json, build/validate/hash/dev-server scripts
packages/hub-types      TypeScript types for the index (mirror of hub.rs)
packages/ui             Shared design tokens
docs/                   ARCHITECTURE.md (engine safety model), MANIFEST.md (index format)
```

## Getting started

Prerequisites: Rust (stable), Node 22, and on Windows the WebView2 runtime (preinstalled on 10/11).

```sh
npm install

# Engine tests
cargo test -p hardpoint-core

# Local hub: builds example mods and serves an index on http://localhost:8765/index.json
npm run index:dev

# Hub website (uses the dev index with the example mods)
npm run hub:dev                     # http://localhost:5173

# Desktop app (in Settings, set the hub index address to http://localhost:8765/index.json)
npm run desktop:dev

# Desktop UI in a plain browser with fake data, no Tauri needed
npm run demo -w apps/desktop        # http://localhost:1420
```

Building the desktop crate directly (`cargo build -p hardpoint-desktop`) needs the UI built first
(`npm run build -w apps/desktop`), because Tauri embeds `apps/desktop/dist`.

Linux note: `Cargo.lock` pins `rust-ini` to 0.21.1; 0.21.3 breaks `tauri-plugin-deep-link` 2.6.2
on Linux. Windows is unaffected.

## How a mod gets installed

1. The archive (zip, 7z, or a folder) is extracted into the library: `%APPDATA%\hardpoint\Hardpoint\data\library\<id>\<version>`.
2. Install rules from the index (or layout detection) map archive paths to `saved:` (Saved Games\DCS) or `install:` (the DCS folder).
3. Enabling copies files into DCS. Any file already there is moved to `backups/` first. A journal makes an interrupted deploy roll back on next start.
4. Disabling removes only files that are still exactly what Hardpoint wrote (by SHA-256), puts backups back, and removes folders it created.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Listing a mod

Add `index/mods/<id>.json` and open a pull request. See [docs/MANIFEST.md](docs/MANIFEST.md) or the
"List your mod" page on the hub. CI validates the entry, checks links, and fills in checksums.

## Roadmap

- Mod profiles (named sets to switch between, e.g. "Squadron night", "Training")
- Server mode: sync a mod set from a mission/server manifest
- Hardlink deploys for large mods on the same drive (copy is the safe default today)
- RAR support (currently: extract with 7-Zip and drop the folder)
- Hub: screenshots, author pages, download counts, "works with DCS 2.9.x" reports
- Signed releases and auto-update for the app

## Licence

MIT. Mods listed in the hub belong to their authors and keep their own licences.
