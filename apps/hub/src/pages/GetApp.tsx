export function GetApp() {
  return (
    <main className="wrap page">
      <h1>Hardpoint for Windows</h1>
      <div className="prose">
        <p className="muted" style={{ fontSize: "1.15rem" }}>
          A small desktop app that installs, updates and removes DCS mods without touching anything it didn't put there.
        </p>
        <p><a className="btn btn-install" href="https://github.com/KianTimmie/Hardpoint/releases/latest">Download the latest release</a></p>

        <h2 style={{ marginTop: 32 }}>What it does</h2>
        <ul>
          <li>Finds your DCS install and <code>Saved Games\DCS</code> folders, including Steam installs.</li>
          <li>Installs from this hub with one click, or from any .zip, .7z or folder you drop onto it.</li>
          <li>Backs up every file a mod replaces and restores it when you disable the mod.</li>
          <li>Refuses to let two mods overwrite the same file, and tells you which ones clash.</li>
          <li>After a DCS update, checks which mods were undone and re-applies them, keeping the new DCS files as the backup.</li>
          <li>Never deletes a file you've edited since it was installed.</li>
        </ul>

        <h2>Command line</h2>
        <p style={{ marginTop: 12 }}>The same engine ships as <code>hardpoint.exe</code> for scripting and server setups:</p>
        <pre className="code"><code>{`hardpoint hub install community-a-4e-c
hardpoint list
hardpoint verify
hardpoint disable community-a-4e-c`}</code></pre>
      </div>
    </main>
  );
}
