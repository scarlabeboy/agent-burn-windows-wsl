interface Size {
  width: number;
  height: number;
}

interface TriggerRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

type Side = "top" | "left" | "right" | "bottom";

/** The caller measures the tooltip after constraining its size to the viewport. */
export function tooltipPlacement(trigger: TriggerRect, tooltip: Size, viewport: Size): { top: number; left: number; side: Side } {
  const margin = 8;
  const clamp = (value: number, size: number, extent: number) =>
    Math.max(margin, Math.min(value, extent - margin - size));
  const centerX = (trigger.left + trigger.right - tooltip.width) / 2;
  const centerY = (trigger.top + trigger.bottom - tooltip.height) / 2;
  const candidates = [
    { side: "top", top: trigger.top - 8 - tooltip.height, left: clamp(centerX, tooltip.width, viewport.width), space: trigger.top - 8 - margin },
    { side: "left", top: clamp(centerY, tooltip.height, viewport.height), left: trigger.left - 8 - tooltip.width, space: trigger.left - 8 - margin },
    { side: "right", top: clamp(centerY, tooltip.height, viewport.height), left: trigger.right + 8, space: viewport.width - margin - trigger.right - 8 },
    { side: "bottom", top: trigger.bottom + 28, left: clamp(centerX, tooltip.width, viewport.width), space: viewport.height - margin - trigger.bottom - 28 },
  ] satisfies { side: Side; top: number; left: number; space: number }[];
  const fitting = candidates.find(({ top, left }) =>
    top >= margin && left >= margin &&
    top + tooltip.height <= viewport.height - margin &&
    left + tooltip.width <= viewport.width - margin,
  );
  if (fitting) return { top: fitting.top, left: fitting.left, side: fitting.side };

  // Keep the first side on ties. Overlap is allowed only when no side fits.
  const best = candidates.reduce((previous, candidate) => candidate.space > previous.space ? candidate : previous);
  return {
    top: clamp(best.top, tooltip.height, viewport.height),
    left: clamp(best.left, tooltip.width, viewport.width),
    side: best.side,
  };
}
