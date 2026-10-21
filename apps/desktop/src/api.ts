import type {
  Config, DeployReport, Detection, DisableReport, ImportResult, IndexResult, ModHealth, ModSummary, Overview, ProgressEvent,
} from "./types";

/** Everything the UI needs from the outside world. Implemented by Tauri (real) and a mock (demo). */
export interface Backend {
  demo: boolean;
  overview(): Promise<Overview>;
  detectPaths(): Promise<Detection>;
  saveConfig(config: Config): Promise<Overview>;
  loadIndex(): Promise<IndexResult>;
  installHub(id: string, version?: string): Promise<ModSummary[]>;
  importPath(path: string, opts?: { liveryFor?: string; target?: string; enable?: boolean }): Promise<ImportResult>;
  enable(id: string): Promise<DeployReport>;
  disable(id: string): Promise<DisableReport>;
  remove(id: string): Promise<DisableReport | null>;
  repair(id: string): Promise<DeployReport>;
  verify(): Promise<ModHealth[]>;
  reveal(target: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  pickFolder(title: string): Promise<string | null>;
  pickArchive(): Promise<string | null>;
  confirm(message: string, title: string, okLabel: string): Promise<boolean>;
  takePendingLink(): Promise<string | null>;
  onProgress(cb: (e: ProgressEvent) => void): () => void;
  onDeepLink(cb: (url: string) => void): () => void;
  onDrop(cb: (e: { type: "enter" | "leave" | "drop"; paths: string[] }) => void): () => void;
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function tauriBackend(): Promise<Backend> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  const dialog = await import("@tauri-apps/plugin-dialog");

  // Tauri's listen() is async; wrap it so callers get a plain unsubscribe function.
  const sub = <T,>(event: string, cb: (p: T) => void) => {
    let un: (() => void) | undefined;
    let cancelled = false;
    listen<T>(event, (e) => cb(e.payload)).then((u) => (cancelled ? u() : (un = u)));
    return () => { cancelled = true; un?.(); };
  };

  return {
    demo: false,
    overview: () => invoke("overview"),
    detectPaths: () => invoke("detect_paths"),
    saveConfig: (config) => invoke("save_config", { config }),
    loadIndex: () => invoke("load_index"),
    installHub: (id, version) => invoke("install_hub", { id, version: version ?? null }),
    importPath: (path, o = {}) => invoke("import_path", { path, liveryFor: o.liveryFor ?? null, target: o.target ?? null, enable: o.enable ?? true }),
    enable: (id) => invoke("enable", { id }),
    disable: (id) => invoke("disable", { id }),
    remove: (id) => invoke("remove", { id }),
    repair: (id) => invoke("repair", { id }),
    verify: () => invoke("verify"),
    reveal: (target) => invoke("reveal", { target }),
    openExternal: (url) => invoke("open_external", { url }),
    pickFolder: async (title) => (await dialog.open({ directory: true, title })) as string | null,
    pickArchive: async () =>
      (await dialog.open({ title: "Add a mod", filters: [{ name: "Mod archives", extensions: ["zip", "7z"] }] })) as string | null,
    confirm: (message, title, okLabel) => dialog.ask(message, { title, kind: "warning", okLabel, cancelLabel: "Cancel" }),
    takePendingLink: () => invoke("take_pending_link"),
    onProgress: (cb) => sub<ProgressEvent>("progress", cb),
    onDeepLink: (cb) => sub<string>("deep-link", cb),
    onDrop: (cb) => {
      let un: (() => void) | undefined;
      let cancelled = false;
      getCurrentWebview()
        .onDragDropEvent((e) => {
          const p = e.payload;
          if (p.type === "enter") cb({ type: "enter", paths: p.paths });
          else if (p.type === "leave") cb({ type: "leave", paths: [] });
          else if (p.type === "drop") cb({ type: "drop", paths: p.paths });
        })
        .then((u) => (cancelled ? u() : (un = u)));
      return () => { cancelled = true; un?.(); };
    },
  };
}

export async function getBackend(): Promise<Backend> {
  if (isTauri) return tauriBackend();
  const { mockBackend } = await import("./mock");
  return mockBackend();
}
