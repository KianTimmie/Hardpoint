const EXAMPLE = `{
  "id": "my-cool-jet",
  "name": "My Cool Jet",
  "summary": "A free trainer jet with a clickable cockpit.",
  "category": "aircraft",
  "authors": [{ "name": "You", "url": "https://github.com/you" }],
  "license": "Freeware",
  "source": "https://github.com/you/my-cool-jet",
  "releases": [
    {
      "version": "1.2.0",
      "date": "2026-10-01",
      "download": {
        "kind": "direct",
        "url": "https://github.com/you/my-cool-jet/releases/download/v1.2.0/MyCoolJet.zip"
      },
      "install": [
        { "from": "MyCoolJet", "to": "saved:Mods/aircraft/MyCoolJet" }
      ]
    }
  ]
}`;

export function Submit() {
  return (
    <main className="wrap page">
      <h1>List your mod</h1>
      <div className="prose">
        <p className="muted" style={{ fontSize: "1.15rem" }}>
          The hub is a folder of JSON files on GitHub. Adding your mod is a pull request; checks run automatically
          and a maintainer merges it.
        </p>
        <ol className="steps">
          <li><strong>Fork the repository</strong> and create <code>index/mods/&lt;your-id&gt;.json</code>. The file name must match the id, and the id can't change later.</li>
          <li>
            <strong>Describe your mod and its releases.</strong>
            <pre className="code"><code>{EXAMPLE}</code></pre>
          </li>
          <li><strong>Add a checksum</strong> for direct downloads by running <code>npm run hash -w index -- --fill my-cool-jet</code>. If you skip this, the check on your pull request will tell you.</li>
          <li><strong>Open the pull request.</strong> The index is validated, links are checked, and the site rebuilds once it's merged.</li>
        </ol>

        <h2>Direct download or download page?</h2>
        <p style={{ marginTop: 12 }}>
          Use <code>"kind": "direct"</code> when the URL is the file itself, such as a GitHub release asset. Hardpoint
          downloads it, checks the checksum and installs it in one click. Use <code>"kind": "page"</code> for ED User
          Files, forums, Patreon or anywhere that needs a click-through. Users download from your page and drop the
          file onto Hardpoint; if you include a <code>sha256</code>, it is matched to your listing automatically.
        </p>

        <h2>Install rules</h2>
        <p style={{ marginTop: 12 }}>
          Each rule copies a file or folder from your archive to a place in DCS. Targets start with{" "}
          <code>saved:</code> for <code>Saved Games\DCS</code> or <code>install:</code> for the DCS install folder.
          Prefer <code>saved:</code>; files in the install folder can fail multiplayer integrity checks and are
          overwritten by DCS updates. Without rules, Hardpoint recognises common layouts (a <code>Mods</code> or{" "}
          <code>Liveries</code> folder, or a folder containing <code>entry.lua</code>), but explicit rules are always
          clearer for users.
        </p>
        <p>
          Liveries: set <code>livery_for</code> to the aircraft's folder name (for example <code>FA-18C_hornet</code>) or
          write rules pointing at <code>saved:Liveries/&lt;aircraft&gt;/&lt;livery&gt;</code>.
        </p>
        <p>
          Lua libraries used inside missions, like MOOSE, set <code>"installable": false</code>; the hub then shows a
          download link instead of an install button.
        </p>
      </div>
    </main>
  );
}
