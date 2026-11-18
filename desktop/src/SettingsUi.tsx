import { useId, useState, type ReactNode } from "react";
import { readFolded, writeFolded } from "./api";
import { Tooltip } from "./Tooltip";

/** An on/off switch. The state shows in the colour and the knob, never in red or green. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  tip,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Read by screen readers, since the visible name sits in the row next to the switch. */
  label: string;
  disabled?: boolean;
  tip?: string;
}) {
  return (
    <Tooltip text={tip}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`switch${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="knob" />
      </button>
    </Tooltip>
  );
}

/**
 * A settings section. Its whole title line folds or opens it; every section starts open, and
 * the ones the user folds stay folded at the next launch (`id` names it in that memory).
 */
export function SettingsCard({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const [folded, setFolded] = useState(() => readFolded().includes(id));
  const bodyId = useId();
  const toggle = () => {
    writeFolded(id, !folded);
    setFolded(!folded);
  };
  return (
    <section className={`set-card${folded ? " folded" : ""}`}>
      <h3 className="set-card-title">
        <button type="button" className="set-card-toggle" aria-expanded={!folded} aria-controls={bodyId} onClick={toggle}>
          {icon && <span className="set-icon">{icon}</span>}
          <span className="set-card-name">{title}</span>
          <svg className="set-chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h3>
      <div id={bodyId} hidden={folded}>
        {children}
      </div>
    </section>
  );
}

/** One setting: its name and a short description on the left, its control on the right. */
export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="set-row">
      <div className="set-text">
        <div className="set-title">{title}</div>
        {description && <div className="set-desc">{description}</div>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}
