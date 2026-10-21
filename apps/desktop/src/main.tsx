import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getBackend } from "./api";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/saira-stencil-one/latin-400.css";
import "./app.css";

getBackend().then((backend) =>
  createRoot(document.getElementById("root")!).render(<StrictMode><App backend={backend} /></StrictMode>),
);
