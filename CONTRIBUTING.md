# Contributing

## Adding or updating a mod listing

1. Fork, then add or edit `index/mods/<id>.json` (see [docs/MANIFEST.md](docs/MANIFEST.md)).
2. Run `npm install && npm run index:build` to validate locally (optional; CI does it too).
3. Open a pull request. CI validates the schema, checks links, and commits missing checksums.

List mods you made, or mods whose authors are happy to be listed. Link to the author's own
download; don't re-host files.

## Code

- Engine changes go in `crates/hardpoint-core` with a test in `tests/engine.rs`. Anything that
  writes to a DCS folder must keep the guarantees in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):
  back up before overwrite, only remove files whose hash matches, roll back on failure.
- If you change the index format, update `index/schema/mod.schema.json`,
  `crates/hardpoint-core/src/hub.rs` and `packages/hub-types/index.ts` together.
- UI: both apps share tokens in `packages/ui/tokens.css`. Use `npm run demo -w apps/desktop` to
  work on the desktop UI in a browser.

Run before pushing:

```sh
cargo test -p hardpoint-core
npm run build -w apps/hub && npm run build -w apps/desktop
```
