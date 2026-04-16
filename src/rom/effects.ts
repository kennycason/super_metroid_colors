/**
 * Palette effects that can be applied to ROM palette data.
 * Each effect transforms BGR555 colors in-place.
 */

import {
  bgr555ToRgb, rgbToBgr555, rgbToHsv, hsvToRgb,
  readColor, writeColor,
} from "./palette";

export type EffectFn = (rom: Uint8Array, offset: number, count: number) => void;

/** Apply a per-color transform to a palette region */
function transformRegion(
  rom: Uint8Array,
  offset: number,
  count: number,
  fn: (r: number, g: number, b: number) => [number, number, number],
) {
  for (let i = 0; i < count; i++) {
    const addr = offset + i * 2;
    const color = readColor(rom, addr);
    if (color === 0) continue; // skip transparent
    const { r, g, b } = bgr555ToRgb(color);
    const [nr, ng, nb] = fn(r, g, b);
    writeColor(rom, addr, rgbToBgr555(nr, ng, nb));
  }
}

// --- Effects ---

export function grayscale(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => {
    const lum = Math.round((r * 77 + g * 150 + b * 29) / 256);
    const l = Math.max(0, Math.min(31, lum));
    return [l, l, l];
  });
}

export function sepia(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => {
    const lum = Math.round((r * 77 + g * 150 + b * 29) / 256);
    return [
      Math.min(31, Math.round(lum * 31 / 24)),
      Math.min(31, Math.round(lum * 22 / 24)),
      Math.min(31, Math.round(lum * 16 / 24)),
    ];
  });
}

export function invert(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => [31 - r, 31 - g, 31 - b]);
}

export function tintRed(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => [Math.min(r + 12, 31), Math.floor(g / 2), Math.floor(b / 2)]);
}

export function tintBlue(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => [Math.floor(r / 2), Math.floor(g / 2), Math.min(b + 12, 31)]);
}

export function tintGreen(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => [Math.floor(r / 2), Math.min(g + 12, 31), Math.floor(b / 2)]);
}

export function neon(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => [
    r > 15 ? 31 : 0,
    g > 15 ? 31 : 0,
    b > 15 ? 31 : 0,
  ]);
}

export function pastel(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => [
    Math.min(31, Math.floor(r / 2) + 12),
    Math.min(31, Math.floor(g / 2) + 12),
    Math.min(31, Math.floor(b / 2) + 12),
  ]);
}

export function dark(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => [Math.floor(r / 2), Math.floor(g / 2), Math.floor(b / 2)]);
}

export function vaporwave(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => [
    Math.min(r + 8, 31),
    Math.floor(g * 2 / 3),
    Math.min(b + 10, 31),
  ]);
}

export function gameboy(rom: Uint8Array, offset: number, count: number) {
  const shades: [number, number, number][] = [
    [1, 4, 1], [5, 12, 5], [12, 22, 10], [20, 30, 16],
  ];
  transformRegion(rom, offset, count, (r, g, b) => {
    const lum = Math.round((r * 77 + g * 150 + b * 29) / 256);
    const shade = lum < 8 ? 0 : lum < 16 ? 1 : lum < 24 ? 2 : 3;
    return shades[shade];
  });
}

export function hueShift(degrees: number): EffectFn {
  return (rom, offset, count) => {
    transformRegion(rom, offset, count, (r, g, b) => {
      const hsv = rgbToHsv(r, g, b);
      hsv.h = (hsv.h + degrees) % 360;
      if (hsv.h < 0) hsv.h += 360;
      const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
      return [rgb.r, rgb.g, rgb.b];
    });
  };
}

export function saturate(amount: number): EffectFn {
  return (rom, offset, count) => {
    transformRegion(rom, offset, count, (r, g, b) => {
      const hsv = rgbToHsv(r, g, b);
      hsv.s = Math.max(0, Math.min(1, hsv.s * amount));
      const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
      return [rgb.r, rgb.g, rgb.b];
    });
  };
}

export function psychedelic(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => {
    const hsv = rgbToHsv(r, g, b);
    hsv.h = (hsv.h * 3) % 360; // triple hue = wild shifts
    hsv.s = Math.min(1, hsv.s * 1.5); // boost saturation
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    return [rgb.r, rgb.g, rgb.b];
  });
}

export function randomize(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, () => [
    Math.floor(Math.random() * 32),
    Math.floor(Math.random() * 32),
    Math.floor(Math.random() * 32),
  ]);
}

export function neonPink(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => {
    const lum = Math.round((r * 77 + g * 150 + b * 29) / 256);
    return [Math.min(31, lum + 12), Math.floor(lum / 3), Math.min(31, lum + 8)];
  });
}

export function iceCold(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => [
    Math.min(31, Math.floor(r / 3) + 8),
    Math.min(31, Math.floor(g / 2) + 12),
    Math.min(31, b + 6),
  ]);
}

export function lava(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => {
    const lum = Math.round((r * 77 + g * 150 + b * 29) / 256);
    return [Math.min(31, lum + 10), Math.min(31, Math.floor(lum / 2)), Math.floor(lum / 4)];
  });
}

export function midnight(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => [
    Math.floor(r / 4),
    Math.floor(g / 4),
    Math.min(31, Math.floor(b / 2) + 4),
  ]);
}

export function golden(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => {
    const lum = Math.round((r * 77 + g * 150 + b * 29) / 256);
    return [Math.min(31, lum + 8), Math.min(31, Math.floor(lum * 0.85)), Math.floor(lum / 4)];
  });
}

export function underwater(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => [
    Math.floor(r / 3),
    Math.min(31, Math.floor(g * 0.7) + 6),
    Math.min(31, Math.floor(b * 0.8) + 10),
  ]);
}

// --- Effect Registry ---

export interface PaletteEffect {
  id: string;
  name: string;
  apply: EffectFn;
  category: "classic" | "tint" | "wild" | "aesthetic";
}

export const EFFECTS: PaletteEffect[] = [
  // Classic
  { id: "grayscale", name: "Grayscale", apply: grayscale, category: "classic" },
  { id: "sepia", name: "Sepia", apply: sepia, category: "classic" },
  { id: "invert", name: "Invert", apply: invert, category: "classic" },
  { id: "dark", name: "Dark", apply: dark, category: "classic" },
  { id: "gameboy", name: "Game Boy", apply: gameboy, category: "classic" },

  // Tints
  { id: "red", name: "Red Tint", apply: tintRed, category: "tint" },
  { id: "blue", name: "Blue Tint", apply: tintBlue, category: "tint" },
  { id: "green", name: "Green Tint", apply: tintGreen, category: "tint" },
  { id: "golden", name: "Golden", apply: golden, category: "tint" },
  { id: "icecold", name: "Ice Cold", apply: iceCold, category: "tint" },
  { id: "lava", name: "Lava", apply: lava, category: "tint" },
  { id: "underwater", name: "Underwater", apply: underwater, category: "tint" },
  { id: "midnight", name: "Midnight", apply: midnight, category: "tint" },

  // Wild
  { id: "neon", name: "Neon", apply: neon, category: "wild" },
  { id: "neonpink", name: "Neon Pink", apply: neonPink, category: "wild" },
  { id: "psychedelic", name: "Psychedelic", apply: psychedelic, category: "wild" },
  { id: "randomize", name: "Random Chaos", apply: randomize, category: "wild" },

  // Aesthetic
  { id: "vaporwave", name: "Vaporwave", apply: vaporwave, category: "aesthetic" },
  { id: "pastel", name: "Pastel", apply: pastel, category: "aesthetic" },
  { id: "hue90", name: "Hue +90", apply: hueShift(90), category: "aesthetic" },
  { id: "hue180", name: "Hue +180", apply: hueShift(180), category: "aesthetic" },
  { id: "hue270", name: "Hue +270", apply: hueShift(270), category: "aesthetic" },
  { id: "saturated", name: "Hypersaturated", apply: saturate(2.0), category: "aesthetic" },
  { id: "desaturated", name: "Desaturated", apply: saturate(0.3), category: "aesthetic" },
];
