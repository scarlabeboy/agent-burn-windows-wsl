/** Single-colour icons for the environments, drawn in the text colour of the menu entry. */

export type EnvId = "computer" | "windows" | "wsl";

export function EnvIcon({ env, size = 18 }: { env: EnvId; size?: number }) {
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
        // Tux: body, white belly, eyes, beak and feet.
        <g>
          <path
            fill="currentColor"
            d="M12 2.5c-2.6 0-4.3 2-4.3 4.6 0 1.3.3 2.2-.4 3.4-1.2 2-2.6 3.8-2.6 6.4 0 2.6 2.7 4.6 7.3 4.6s7.3-2 7.3-4.6c0-2.6-1.4-4.4-2.6-6.4-.7-1.2-.4-2.1-.4-3.4 0-2.6-1.7-4.6-4.3-4.6z"
          />
          <ellipse cx="12" cy="15.6" rx="3.6" ry="4.6" fill="var(--env-icon-belly, var(--sidebar))" />
          <circle cx="10.6" cy="6.8" r="0.9" fill="var(--env-icon-belly, var(--sidebar))" />
          <circle cx="13.4" cy="6.8" r="0.9" fill="var(--env-icon-belly, var(--sidebar))" />
          <path fill="var(--env-icon-accent, #f4b740)" d="M10.4 8.9h3.2L12 10.6z" />
          <path fill="var(--env-icon-accent, #f4b740)" d="M5.6 19.4l2.8-1.1 1.2 2.6-3.2.4zM18.4 19.4l-2.8-1.1-1.2 2.6 3.2.4z" />
        </g>
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
