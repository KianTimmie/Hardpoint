# Architecture

## Components

```
            index/mods/*.json  (pull requests)
                    │  index/scripts/build.mjs (validate, compile)
                    ▼
            index.json  ── published with the hub site (GitHub Pages)
              │                         │
              ▼                         ▼
     Hub website (static)        Desktop app / CLI
     browse, search, mod pages   hardpoint-core engine
     "Install with Hardpoint" ──► hardpoint://install/<id>?version=<v>
                                        │
                     author's download (GitHub release, ED User Files…)
                                        ▼
                     DCS install folder  +  Saved Games\DCS
```

The hub stores metadata only. Downloads come from where authors already publish:

| Delivery | When | What the app does |
|---|---|---|
| `direct` | URL is the file (GitHub release asset) | Downloads, verifies SHA-256, installs |
| `page` | Click-through sites (ED User Files, forums, Patreon) | Opens the page; the user drops the file on the app, which matches it to the listing by checksum and applies the listing's install rules |
| `installable: false` | Lua libraries used inside missions (MOOSE, MIST) | Download link only |
| no releases | Listing only | Link to the author's page |

## Engine safety model (`crates/hardpoint-core/src/engine.rs`)

Mods change files in someone's game folder, so the engine is built around never losing a file.

- **Library is the source of truth.** Archives are extracted once into `library/<id>/<version>`.
  Enabling copies from there; disabling never needs the original archive.
- **Two roots.** Targets are `saved:<path>` or `install:<path>`. Saved Games mods don't trip the
  multiplayer integrity check; install-folder mods may, and the UI says so before installing.
- **Backups.** If a target already exists, it is moved to `backups/<id>/<root>/<path>` before the
  mod's file is written, and moved back on disable.
- **Ownership and conflicts.** Each deployed file is recorded with its SHA-256. A mod can't be
  enabled if another enabled mod already owns any of its targets; the user sees which files and
  which mod.
- **Only remove what's ours.** On disable, a file is deleted only if its hash still matches what was
  deployed. Files changed since (user edits, DCS updates) are left in place and reported.
- **DCS updates.** `verify` reports missing/changed files per mod and whether DCS's version changed
  since deploy (from `autoupdate.cfg`). `repair` re-applies the mod; the file DCS put back becomes
  the new backup, so a later disable restores the *current* vanilla file rather than a stale one.
  Superseded backups go to `orphaned/` and are never deleted automatically.
- **Crash safety.** Before deploying, the plan is written to `journal.json`. If the app dies
  mid-deploy, the next start rolls back: backups are restored, new files removed, created folders
  pruned. `state.json` and `config.json` are written atomically (temp file + rename).
- **Archive safety.** Paths with `..`, absolute paths or drive prefixes are rejected (zip-slip).
  Format is detected from magic bytes; RAR gets a clear "extract it first" message.

## Layout detection (`layout.rs`)

Used when a listing has no install rules, or for files dropped in with no listing:

1. Contains `bin`, `CoreMods`, `Bazar`… → mirror of the DCS folder → `install:`
2. Contains `Mods`, `Liveries`, `Scripts`, `Kneeboard`, `Missions`… → each maps to `saved:<Folder>`
3. Folder with `entry.lua` → `saved:Mods/aircraft/<name>` (`tech`/`terrains` by category)
4. Folder with `description.lua` → livery; needs the aircraft folder (`livery_for`), otherwise the app asks
5. Loose `.miz` files → `saved:Missions`
6. A single wrapper folder (plus readmes) → look inside; several folders → each must resolve
7. Anything else → ask the user rather than guess

## DCS path detection (`paths.rs`)

Registry (`HKCU\Software\Eagle Dynamics\DCS World[ OpenBeta]` → `Path`), Steam libraries
(`libraryfolders.vdf`, app 223750), and common install paths. Saved Games uses
`dcs_variant.txt` to pick `DCS` vs `DCS.<variant>`. On Linux it checks Steam/Proton prefixes.
`HARDPOINT_DCS_INSTALL` / `HARDPOINT_DCS_SAVED` override everything (handy for tests).

## Desktop app (`apps/desktop`)

The Tauri shell (`src-tauri/src/lib.rs`) wraps engine calls as commands. Downloads run without
holding the engine lock and stream `progress` events. `hardpoint://` links are registered by the
installer; the single-instance plugin forwards a link to an already-running app. Links never
install silently; the app always asks first.

The React UI (`src`) talks to a `Backend` interface with two implementations: Tauri, and an
in-memory mock used for browser demo mode.

## Data folder

`%APPDATA%\hardpoint\Hardpoint\data` on Windows (`~/.local/share/hardpoint` on Linux), shared by
the app and the CLI.
