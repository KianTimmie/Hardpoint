import { useRoute, browseHref } from "./router";
import { useIndex } from "./data";
import { Header, Footer } from "./components/Chrome";
import { Home } from "./pages/Home";
import { Browse } from "./pages/Browse";
import { Mod } from "./pages/Mod";
import { Submit } from "./pages/Submit";
import { GetApp } from "./pages/GetApp";
import { Credits } from "./pages/Credits";

export function App() {
  const route = useRoute();
  const data = useIndex();
  const query = route.name === "browse" ? route.q : "";
  const onSearch = (q: string) => (location.hash = browseHref({ q: q.trim() }));

  let body: React.ReactNode;
  if (data.status === "loading") body = <main className="wrap page"><p className="muted">Loading the index…</p></main>;
  else if (data.status === "error")
    body = (
      <main className="wrap page">
        <h1>The mod index didn't load</h1>
        <p className="muted" style={{ marginTop: 12 }}>{data.message}. Check your connection and reload the page.</p>
      </main>
    );
  else {
    const index = data.index;
    switch (route.name) {
      case "home": body = <Home index={index} />; break;
      case "browse": body = <Browse index={index} route={route} />; break;
      case "mod": body = <Mod index={index} id={route.id} />; break;
      case "submit": body = <Submit />; break;
      case "app": body = <GetApp />; break;
      case "credits": body = <Credits index={index} />; break;
      default:
        body = <main className="wrap page"><h1>Page not found</h1><p style={{ marginTop: 12 }}><a href="#/">Go to the hub home page</a></p></main>;
    }
  }

  return (
    <>
      <Header route={route} query={query} onSearch={onSearch} />
      {body}
      <Footer generated={data.status === "ready" ? data.index.generated : undefined} />
    </>
  );
}
