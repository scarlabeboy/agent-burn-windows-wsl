/** Side of the picture sent to the notification area; Windows scales it to its icon size. */
export const TRAY_ICON_SIZE = 32;

/** Dark enough for white figures on a light or a dark taskbar. */
const TONES = { ok: "#1f9d55", warn: "#b7791f", danger: "#d63447", stale: "#6b7280" };

export type TrayIconTone = keyof typeof TONES;

/** A remaining percentage in white on a rounded square of its colour, as RGBA bytes. */
export function drawTrayIcon(value: number, tone: TrayIconTone): number[] | null {
  const canvas = document.createElement("canvas");
  canvas.width = TRAY_ICON_SIZE;
  canvas.height = TRAY_ICON_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = TONES[tone];
  context.beginPath();
  context.roundRect(0, 0, TRAY_ICON_SIZE, TRAY_ICON_SIZE, 7);
  context.fill();

  const label = String(value);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  // As large as the square allows: two figures fill it, one figure stays the same height.
  let size = 26;
  const font = () => `700 ${size}px "Segoe UI", sans-serif`;
  context.font = font();
  while (context.measureText(label).width > TRAY_ICON_SIZE - 3 && size > 12) {
    size -= 1;
    context.font = font();
  }
  context.fillText(label, TRAY_ICON_SIZE / 2, TRAY_ICON_SIZE / 2 + 1);
  return Array.from(context.getImageData(0, 0, TRAY_ICON_SIZE, TRAY_ICON_SIZE).data);
}
