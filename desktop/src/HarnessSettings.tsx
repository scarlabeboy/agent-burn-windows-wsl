import type { ReactNode } from "react";
import type { HarnessGroups } from "./harnesses";
import { t } from "./i18n";
import { Switch } from "./SettingsUi";
import { BrandIcon, agentLabel } from "./views";

interface Props {
  groups: HarnessGroups;
  onToggle: (id: string, off: boolean) => void;
}

function Group({
  title,
  ids,
  open,
  control,
}: {
  title: string;
  ids: string[];
  open: boolean;
  /** The switch of a row; groups without one list harnesses that cannot be switched. */
  control?: (id: string) => ReactNode;
}) {
  return (
    <details className="hs-group" open={open}>
      <summary>
        {title} <span className="muted">({ids.length})</span>
      </summary>
      {ids.length === 0 ? (
        <div className="muted small hs-empty">{t().harnesses.none}</div>
      ) : (
        ids.map((id) => (
          <div key={id} className={`hs-row${control ? "" : " dim"}`}>
            <BrandIcon agent={id} size={18} />
            <span className="hs-name">{agentLabel(id)}</span>
            {control?.(id)}
          </div>
        ))
      )}
    </details>
  );
}

/** Every harness the CLI reads, in three groups. Only active and disabled ones have a switch. */
export function HarnessSettings({ groups, onToggle }: Props) {
  const lastActive = groups.active.length <= 1;
  const text = t().harnesses;
  return (
    <div className="hs">
      <Group
        title={text.active}
        ids={groups.active}
        open
        control={(id) => (
          <Switch
            checked
            label={text.read(agentLabel(id))}
            disabled={lastActive}
            tip={lastActive ? text.keepOne : undefined}
            onChange={() => onToggle(id, true)}
          />
        )}
      />
      <Group
        title={text.disabled}
        ids={groups.disabled}
        open={false}
        control={(id) => (
          <Switch
            checked={false}
            label={text.read(agentLabel(id))}
            onChange={() => onToggle(id, false)}
          />
        )}
      />
      <Group title={text.undetected} ids={groups.undetected} open={false} />
    </div>
  );
}
