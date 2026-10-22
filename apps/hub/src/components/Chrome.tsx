import type { Route } from "../router";

export function Wordmark() {
  return (
    <a className="mark" href="#/" aria-label="Hardpoint hub home">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="currentColor" />
        <path d="M4 12h24M16 12v6M9 12v4M23 12v4" stroke="var(--paper)" strokeWidth="2.5" />
        <rect x="12.5" y="18" width="7" height="9" rx="3.5" fill="var(--red)" />
      </svg>
      HARDPOINT
    </a>
  );
}

export function Header({ route, query, onSearch }: { route: Route; query: string; onSearch: (q: string) => void }) {
  const cur = (n: Route["name"]) => (route.name === n ? "page" : undefined);
  return (
    <header className="top">
      <div className="wrap">
        <Wordmark />
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(new FormData(e.currentTarget).get("q") as string);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.8" /></svg>
          <label className="sr" htmlFor="q">Search mods</label>
          <input id="q" name="q" type="search" placeholder="Search mods, authors, aircraft" defaultValue={query} key={query} />
        </form>
        <nav className="nav" aria-label="Main">
          <a href="#/browse" aria-current={cur("browse")}>Browse</a>
          <a href="#/submit" aria-current={cur("submit")}>List your mod</a>
          <a href="#/app" aria-current={cur("app")}>Get the app</a>
        </nav>
      </div>
    </header>
  );
}

export function Footer({ generated }: { generated?: string }) {
  return (
    <footer className="foot">
      <div className="wrap">
        <p>
          Hardpoint is an open-source community project and is not affiliated with Eagle Dynamics.
          <br />
          DCS World is a trademark of Eagle Dynamics SA. Mods belong to their authors.
        </p>
        <p>
          {generated && <>Index updated {new Date(generated).toLocaleDateString(undefined, { dateStyle: "medium" })}<br /></>}
          <a href="#/credits">Photo credits</a><br /><a href="https://github.com/KianTimmie/Hardpoint">Source on GitHub</a>
        </p>
      </div>
    </footer>
  );
}
