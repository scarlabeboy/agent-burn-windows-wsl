import type { ReactNode } from "react";
import type { HarnessGroups } from "./harnesses";
import { BrandIcon, agentLabel } from "./views";

interface Props {
  groups: HarnessGroups;
  onToggle: (id: string, off: boolean) => void;
}

function Group({
  title,
  ids,
  open,
  action,
}: {
  title: string;
  ids: string[];
  open: boolean;
  action?: (id: string) => ReactNode;
}) {
  return (
    <details className="harness-group" open={open}>
      <summary>
        {title} <span className="muted">({ids.length})</span>
      </summary>
      {ids.length === 0 ? (
        <div className="muted small harness-empty">Aucun</div>
      ) : (
        ids.map((id) => (
          <div key={id} className={`harness-row${action ? "" : " dim"}`}>
            <BrandIcon agent={id} size={18} />
            <span className="harness-name">{agentLabel(id)}</span>
            {action?.(id)}
          </div>
        ))
      )}
    </details>
  );
}

/** Every harness the CLI reads, in three groups. Only active and disabled ones can be switched. */
export function HarnessSettings({ groups, onToggle }: Props) {
  const lastActive = groups.active.length <= 1;
  return (
    <div className="harness-settings">
      <div className="harness-title">Harness</div>
      <Group
        title="Actifs"
        ids={groups.active}
        open
        action={(id) => (
          <button
            className="link"
            disabled={lastActive}
            title={lastActive ? "Au moins un harness doit rester actif" : "Ne plus lire ce harness"}
            onClick={() => onToggle(id, true)}
          >
            Désactiver
          </button>
        )}
      />
      <Group
        title="Désactivés"
        ids={groups.disabled}
        open={false}
        action={(id) => (
          <button className="link" onClick={() => onToggle(id, false)}>
            Réactiver
          </button>
        )}
      />
      <Group title="Non détectés" ids={groups.undetected} open={false} />
      <p className="muted small harness-hint">
        Un harness désactivé n'est plus lu (le scan est plus rapide) et disparaît des totaux et des quotas.
      </p>
    </div>
  );
}
