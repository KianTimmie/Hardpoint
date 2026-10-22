import type { HubMod } from "../types";
import { delivery, downloadOnlyKind, latestRelease, writesInstallDir } from "../types";

export function DeliveryTag({ mod }: { mod: HubMod }) {
  switch (delivery(mod)) {
    case "one-click": return <span className="tag oneclick" title="Hardpoint downloads and installs this for you">One-click install</span>;
    case "page": return <span className="tag ext" title="Download from the author's page, then drop the file into Hardpoint">Author's page</span>;
    case "download-only": {
      const k = downloadOnlyKind(mod);
      return <span className="tag dl" title={k.note}>{k.label}</span>;
    }
    default: return <span className="tag ext">Listing</span>;
  }
}

export function IcTag({ mod }: { mod: HubMod }) {
  const w = writesInstallDir(latestRelease(mod));
  if (w !== true) return null;
  return <span className="tag ic" title="Changes files in the DCS install folder; servers with integrity check enabled may refuse it">Modifies core files</span>;
}
