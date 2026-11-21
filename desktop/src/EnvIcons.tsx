import { DISTRO_LOGOS, distroLogoId } from "./distroLogos";

/**
 * Icons for the environments, drawn in the text colour of the menu entry. WSL shows the logo of
 * `distro` when it is known, Tux otherwise.
 */

export type EnvId = "computer" | "windows" | "wsl";

export function EnvIcon({ env, distro, size = 18 }: { env: EnvId; distro?: string; size?: number }) {
  const logo = DISTRO_LOGOS[distroLogoId(distro)];
  return (
    <svg className="env-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {env === "windows" ? (
        <g fill="currentColor">
          <rect x="3" y="3" width="8.4" height="8.4" rx="0.6" />
          <rect x="12.6" y="3" width="8.4" height="8.4" rx="0.6" />
          <rect x="3" y="12.6" width="8.4" height="8.4" rx="0.6" />
          <rect x="12.6" y="12.6" width="8.4" height="8.4" rx="0.6" />
        </g>
      ) : env === "wsl" ? (
        // The distribution's logo in its colour, which gives way to the text colour on a selected
        // entry (`--env-icon-brand`); Tux for a distribution without one.
        <path
          fill={logo.color ? `var(--env-icon-brand, ${logo.color})` : "currentColor"}
          d={logo.path}
        />
      ) : (
        // A monitor on its stand.
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="12" rx="1.6" />
          <path d="M12 16v3.5M8 20h8" />
        </g>
      )}
    </svg>
  );
}
