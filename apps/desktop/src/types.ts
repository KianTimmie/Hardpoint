export * from "../../../packages/hub-types/index.ts";
import type { Category, HubIndex } from "../../../packages/hub-types/index.ts";

// Mirrors of the Rust types returned by Tauri commands (apps/desktop/src-tauri/src/lib.rs).
export interface ModSummary {
  id: string;
  name: string;
  version: string;
  category: Category;
  source: { type: "hub"; download_url?: string } | { type: "local"; file_name: string };
  enabled: boolean;
  writes_install_dir: boolean;
  files: number;
  bytes: number;
  targets: string[];
  imported_at: string;
  enabled_at?: string | null;
}

export interface Config { install_dir?: string | null; saved_dir?: string | null; index_url: string }

export interface Overview {
  config: Config;
  paths: { install?: string | null; saved?: string | null };
  install_ok: boolean;
  saved_ok: boolean;
  dcs_version?: string | null;
  data_dir: string;
  mods: ModSummary[];
}

export interface Update { id: string; installed: string; latest: string }
export interface IndexResult { index: HubIndex; updates: Update[]; offline: boolean; error?: string | null }
export interface ModHealth { id: string; name: string; ok: number; missing: string[]; changed: string[]; dcs_updated: boolean }
export interface Detection { install_candidates: string[]; saved_candidates: string[] }
export interface DeployReport { id: string; files: number; bytes: number; backed_up: number }
export interface DisableReport { id: string; removed: number; restored: number; kept_changed: string[] }
export interface ImportResult { id: string; name: string; matched_hub: boolean; enabled: boolean; writes_install_dir: boolean }
export interface ProgressEvent { id: string; phase: "download" | "install" | "done"; done: number; total?: number | null }

export interface ErrorInfo {
  kind: string;
  message: string;
  conflicts?: { target: string; owner: string }[];
  url?: string;
}

export function asError(e: unknown): ErrorInfo {
  if (e && typeof e === "object" && "message" in e && "kind" in e) return e as ErrorInfo;
  return { kind: "other", message: String((e as Error)?.message ?? e) };
}
