/**
 * Super Metroid ROM Palette Engine
 *
 * BGR555 format: 0BBBBBGGGGGRRRRR (16-bit, 5 bits per channel)
 * Each palette = 16 colors x 2 bytes = 32 bytes
 *
 * ROM addresses (PC offset, unheadered):
 *   Samus Power Suit:   0x0D9400
 *   Samus Varia Suit:   0x0D9820
 *   Samus Gravity Suit: 0x0D9C40
 *
 * For headered ROMs (+0x200): add 0x200 to all offsets.
 */

// --- BGR555 Color Math ---

export interface RGB {
  r: number; // 0-31
  g: number;
  b: number;
}

export interface HSV {
  h: number; // 0-360
  s: number; // 0-1
  v: number; // 0-1
}

export function bgr555ToRgb(color: number): RGB {
  return {
    r: color & 0x1f,
    g: (color >> 5) & 0x1f,
    b: (color >> 10) & 0x1f,
  };
}

export function rgbToBgr555(r: number, g: number, b: number): number {
  return (
    (Math.max(0, Math.min(31, Math.round(r)))) |
    (Math.max(0, Math.min(31, Math.round(g))) << 5) |
    (Math.max(0, Math.min(31, Math.round(b))) << 10)
  );
}

export function readColor(rom: Uint8Array, offset: number): number {
  return rom[offset] | (rom[offset + 1] << 8);
}

export function writeColor(rom: Uint8Array, offset: number, color: number) {
  rom[offset] = color & 0xff;
  rom[offset + 1] = (color >> 8) & 0xff;
}

// --- RGB <-> HSV ---

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rf = r / 31, gf = g / 31, bf = b / 31;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rf) h = 60 * (((gf - bf) / delta) % 6);
    else if (max === gf) h = 60 * ((bf - rf) / delta + 2);
    else h = 60 * ((rf - gf) / delta + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;

  let rr: number, gg: number, bb: number;
  if (h < 60) { rr = c; gg = x; bb = 0; }
  else if (h < 120) { rr = x; gg = c; bb = 0; }
  else if (h < 180) { rr = 0; gg = c; bb = x; }
  else if (h < 240) { rr = 0; gg = x; bb = c; }
  else if (h < 300) { rr = x; gg = 0; bb = c; }
  else { rr = c; gg = 0; bb = x; }

  return {
    r: Math.round((rr + m) * 31),
    g: Math.round((gg + m) * 31),
    b: Math.round((bb + m) * 31),
  };
}

// --- RGB 5-bit to 8-bit for display ---

export function rgb5to8(val5: number): number {
  return Math.round((val5 / 31) * 255);
}

export function rgbToCss(r: number, g: number, b: number): string {
  return `rgb(${rgb5to8(r)}, ${rgb5to8(g)}, ${rgb5to8(b)})`;
}

// --- Palette read/write helpers ---

export function readPalette(rom: Uint8Array, offset: number, count = 16): number[] {
  const colors: number[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(readColor(rom, offset + i * 2));
  }
  return colors;
}

export function writePalette(rom: Uint8Array, offset: number, colors: number[]) {
  for (let i = 0; i < colors.length; i++) {
    writeColor(rom, offset + i * 2, colors[i]);
  }
}

// --- ROM Addresses ---

export const SAMUS_PALETTES = {
  power: { offset: 0x0d9400, name: "Power Suit", count: 16 },
  varia: { offset: 0x0d9820, name: "Varia Suit", count: 16 },
  gravity: { offset: 0x0d9c40, name: "Gravity Suit", count: 16 },
} as const;

// Samus has multiple palette sets per suit (visor flash, damage, etc.)
// Each suit block is 0x420 bytes = 33 palettes of 32 bytes
export const SAMUS_PALETTE_BLOCKS = {
  power: { start: 0x0d9400, size: 0x0420, name: "Power Suit (all frames)" },
  varia: { start: 0x0d9820, size: 0x0420, name: "Varia Suit (all frames)" },
  gravity: { start: 0x0d9c40, size: 0x0420, name: "Gravity Suit (all frames)" },
} as const;

// Header detection
export function hasHeader(rom: Uint8Array): boolean {
  // SMC header is 512 bytes; ROM data starts at 0x200
  // Unheadered ROM sizes are multiples of 0x8000 (32KB)
  return rom.length % 0x8000 === 0x200;
}

export function headerOffset(rom: Uint8Array): number {
  return hasHeader(rom) ? 0x200 : 0;
}
