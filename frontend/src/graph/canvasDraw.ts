/**
 * Custom 2D-canvas draw functions for sigma labels/hover — the defaults draw
 * a white hover card that clashes with the instrument-panel theme.
 */

import type { Attributes } from "graphology-types";
import type { Settings } from "sigma/settings";
import type { NodeDisplayData, PartialButFor } from "sigma/types";

type LabelData = PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color">;

export function drawNodeLabel<N extends Attributes, E extends Attributes, G extends Attributes>(
  context: CanvasRenderingContext2D,
  data: LabelData,
  settings: Settings<N, E, G>,
): void {
  if (!data.label) return;
  const size = settings.labelSize;
  context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
  context.fillStyle = "#94a5b8";
  context.fillText(data.label, data.x + data.size + 5, data.y + size / 3);
}

export function drawNodeHover<N extends Attributes, E extends Attributes, G extends Attributes>(
  context: CanvasRenderingContext2D,
  data: LabelData,
  settings: Settings<N, E, G>,
): void {
  if (!data.label) return;
  const size = settings.labelSize;
  context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
  const width = context.measureText(data.label).width;
  const x = data.x + data.size + 5;
  const y = data.y;
  const padX = 6;
  const padY = 5;

  context.beginPath();
  context.fillStyle = "rgba(10, 14, 20, 0.92)";
  context.strokeStyle = data.color ?? "#f5a83c";
  context.lineWidth = 1;
  const rx = x - padX;
  const ry = y - size / 2 - padY;
  const rw = width + padX * 2;
  const rh = size + padY * 2;
  const r = 3;
  context.moveTo(rx + r, ry);
  context.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
  context.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
  context.arcTo(rx, ry + rh, rx, ry, r);
  context.arcTo(rx, ry, rx + rw, ry, r);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#dbe6f1";
  context.fillText(data.label, x, y + size / 3);
}
