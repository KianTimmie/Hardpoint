import type { HubMod } from "../types";
import { modHref } from "../router";
import { CardGrid, ModCard } from "../../../../packages/ui/ModCard.tsx";
import { DeliveryTag, IcTag } from "./Badges";

export function ModGrid({ mods }: { mods: HubMod[] }) {
  return (
    <CardGrid>
      {mods.map((m) => (
        <ModCard key={m.id} mod={m} href={modHref(m.id)} badge={<><DeliveryTag mod={m} /><IcTag mod={m} /></>} />
      ))}
    </CardGrid>
  );
}
