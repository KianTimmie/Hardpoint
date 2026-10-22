# Index entry format

One file per mod: `index/mods/<id>.json`. The JSON Schema is `index/schema/mod.schema.json`
(editors that support `$schema` will autocomplete and validate as you type).

```json
{
  "$schema": "../schema/mod.schema.json",
  "id": "my-cool-jet",
  "name": "My Cool Jet",
  "summary": "A free trainer jet with a clickable cockpit.",
  "description": "Markdown. Shown on the mod page.",
  "category": "aircraft",
  "tags": ["trainer", "free"],
  "authors": [{ "name": "You", "url": "https://github.com/you" }],
  "license": "Freeware",
  "homepage": "https://forum.dcs.world/topic/…",
  "source": "https://github.com/you/my-cool-jet",
  "images": ["https://raw.githubusercontent.com/you/my-cool-jet/main/docs/screenshot.jpg"],
  "requires_modules": ["Syria map"],
  "dependencies": [{ "id": "some-other-mod", "min_version": "1.2" }],
  "releases": [
    {
      "version": "1.2.0",
      "date": "2026-10-01",
      "changelog": "Markdown.",
      "dcs_min": "2.9.10",
      "download": {
        "kind": "direct",
        "url": "https://github.com/you/my-cool-jet/releases/download/v1.2.0/MyCoolJet.zip",
        "sha256": "…filled in by `npm run hash -- --fill`…",
        "size": 123456789
      },
      "install": [
        { "from": "MyCoolJet", "to": "saved:Mods/aircraft/MyCoolJet" }
      ]
    }
  ]
}
```

## Fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Lowercase, digits, hyphens. Must match the file name. Never changes. |
| `name`, `summary` | yes | Summary is one line (10–160 characters). |
| `category` | yes | `aircraft`, `livery`, `terrain`, `mission`, `campaign`, `script`, `sound`, `tech`, `utility`, `other` |
| `authors` | yes | `[{ "name", "url"? }]` |
| `images` | no | Up to 8 `https://` image URLs of your own screenshots. The first is the card photo. They're linked, not copied, so keep them where they are. Without images, the hub shows a drawing for the category. |
| `installable` | no | Default `true`. Set `false` for things used inside missions (Lua libraries). |
| `releases` | no | May be empty for a listing-only entry (then `homepage` or `source` is required). |
| `releases[].download.kind` | yes | `direct` (the URL is the file) or `page` (a page the user downloads from). |
| `releases[].download.sha256` | for `direct` | CI fills it in. For `page` downloads it's optional but lets the app recognise the dropped file. |
| `releases[].install` | no | Rules: `from` = file/folder in the archive (`""` = whole archive), `to` = target. Omit to use layout detection. |
| `releases[].livery_for` | liveries | DCS aircraft folder name, e.g. `FA-18C_hornet`, `F-16C_50`. |

## Targets

- `saved:<path>` → `%USERPROFILE%\Saved Games\DCS\<path>`. Preferred: doesn't affect the
  multiplayer integrity check, and DCS updates don't touch it.
- `install:<path>` → the DCS installation folder. Can fail integrity checks and is overwritten
  by updates; Hardpoint flags these mods and can re-apply them after an update.

`..` is not allowed anywhere in a target.

## Tools

```sh
npm run index:build                     # validate + write index/dist/index.json
npm run hash -w index -- <url-or-file>  # print sha256 and size
npm run hash -w index -- --fill [id]    # fill missing checksums for direct downloads
npm run index:dev                       # serve a dev index with the example mods
```
