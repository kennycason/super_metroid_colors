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
  fn: (r: number, g: number, b: number, index: number) => [number, number, number],
) {
  for (let i = 0; i < count; i++) {
    const addr = offset + i * 2;
    const color = readColor(rom, addr);
    if (color === 0) continue; // skip transparent
    const { r, g, b } = bgr555ToRgb(color);
    const [nr, ng, nb] = fn(r, g, b, i);
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
    hsv.h = (hsv.h * 3) % 360;
    hsv.s = Math.min(1, hsv.s * 1.5);
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

// --- New Effects ---

/** Rainbow: map each color's hue position to a rainbow based on its index */
export function rainbow(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b, i) => {
    const hsv = rgbToHsv(r, g, b);
    hsv.h = (i * 360 / Math.max(count, 1)) % 360;
    hsv.s = Math.max(0.7, hsv.s);
    hsv.v = Math.max(0.4, hsv.v);
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    return [rgb.r, rgb.g, rgb.b];
  });
}

/** Cyberpunk: hot pink + electric blue with high contrast */
export function cyberpunk(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => {
    const lum = Math.round((r * 77 + g * 150 + b * 29) / 256);
    if (lum > 20) return [31, Math.floor(lum / 4), Math.min(31, lum + 6)];
    if (lum > 10) return [Math.min(31, lum + 8), 0, Math.min(31, lum + 14)];
    return [Math.floor(lum / 2), Math.min(31, lum + 6), Math.min(31, lum + 10)];
  });
}

/** Complementary: shift each color to its complementary (opposite hue) */
export function complementary(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => {
    const hsv = rgbToHsv(r, g, b);
    hsv.h = (hsv.h + 180) % 360;
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    return [rgb.r, rgb.g, rgb.b];
  });
}

/** Triadic: shift hue by 120 degrees for triadic harmony */
export function triadic(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => {
    const hsv = rgbToHsv(r, g, b);
    hsv.h = (hsv.h + 120) % 360;
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    return [rgb.r, rgb.g, rgb.b];
  });
}

/** Acid: extreme saturation + hue warp for a truly psychedelic look */
export function acid(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => {
    const hsv = rgbToHsv(r, g, b);
    hsv.h = (hsv.h * 5 + 60) % 360;
    hsv.s = 1.0;
    hsv.v = Math.max(0.5, hsv.v);
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    return [rgb.r, rgb.g, rgb.b];
  });
}

/** Thermal: heat-map style — dark=blue, mid=red/orange, bright=yellow/white */
export function thermal(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b) => {
    const lum = (r * 77 + g * 150 + b * 29) / 256;
    const t = lum / 31; // 0..1
    if (t < 0.25) return [0, 0, Math.round(t * 4 * 31)];
    if (t < 0.5) return [Math.round((t - 0.25) * 4 * 31), 0, Math.round((0.5 - t) * 4 * 31)];
    if (t < 0.75) return [31, Math.round((t - 0.5) * 4 * 31), 0];
    return [31, 31, Math.round((t - 0.75) * 4 * 31)];
  });
}

/** Hologram: iridescent green-blue-purple tint */
export function hologram(rom: Uint8Array, offset: number, count: number) {
  transformRegion(rom, offset, count, (r, g, b, i) => {
    const lum = Math.round((r * 77 + g * 150 + b * 29) / 256);
    const phase = (i * 40) % 360;
    const rgb = hsvToRgb(phase, 0.6, Math.max(0.3, lum / 31));
    return [rgb.r, rgb.g, rgb.b];
  });
}

/** Random transparency: randomly set colors to 0 (transparent black) */
export function randomTransparency(percentage: number): EffectFn {
  return (rom, offset, count) => {
    // Use a seeded approach based on color value for consistency across previews
    for (let i = 0; i < count; i++) {
      const addr = offset + i * 2;
      const color = readColor(rom, addr);
      if (color === 0) continue;
      // Hash the color value + index for deterministic "randomness"
      const hash = ((color * 2654435761) ^ (i * 2246822519)) >>> 0;
      if ((hash % 100) < percentage) {
        writeColor(rom, addr, 0);
      }
    }
  };
}

// --- Effect Registry ---

export interface PaletteEffect {
  id: string;
  name: string;
  apply: EffectFn;
}

export const EFFECTS: PaletteEffect[] = [
  { id: "grayscale", name: "Grayscale", apply: grayscale },
  { id: "sepia", name: "Sepia", apply: sepia },
  { id: "invert", name: "Invert", apply: invert },
  { id: "dark", name: "Dark", apply: dark },
  { id: "gameboy", name: "Game Boy", apply: gameboy },
  { id: "red", name: "Red Tint", apply: tintRed },
  { id: "blue", name: "Blue Tint", apply: tintBlue },
  { id: "green", name: "Green Tint", apply: tintGreen },
  { id: "golden", name: "Golden", apply: golden },
  { id: "icecold", name: "Ice Cold", apply: iceCold },
  { id: "lava", name: "Lava", apply: lava },
  { id: "underwater", name: "Underwater", apply: underwater },
  { id: "midnight", name: "Midnight", apply: midnight },
  { id: "neon", name: "Neon", apply: neon },
  { id: "neonpink", name: "Neon Pink", apply: neonPink },
  { id: "psychedelic", name: "Psychedelic", apply: psychedelic },
  { id: "randomize", name: "Random Chaos", apply: randomize },
  { id: "vaporwave", name: "Vaporwave", apply: vaporwave },
  { id: "pastel", name: "Pastel", apply: pastel },
  { id: "hue90", name: "Hue +90", apply: hueShift(90) },
  { id: "hue180", name: "Hue +180", apply: hueShift(180) },
  { id: "hue270", name: "Hue +270", apply: hueShift(270) },
  { id: "saturated", name: "Hypersaturated", apply: saturate(2.0) },
  { id: "desaturated", name: "Desaturated", apply: saturate(0.3) },
  { id: "rainbow", name: "Rainbow", apply: rainbow },
  { id: "cyberpunk", name: "Cyberpunk", apply: cyberpunk },
  { id: "complementary", name: "Complementary", apply: complementary },
  { id: "triadic", name: "Triadic", apply: triadic },
  { id: "acid", name: "Acid Trip", apply: acid },
  { id: "thermal", name: "Thermal", apply: thermal },
  { id: "hologram", name: "Hologram", apply: hologram },
  { id: "ghost10", name: "Ghost 10%", apply: randomTransparency(10) },
  { id: "ghost25", name: "Ghost 25%", apply: randomTransparency(25) },
  { id: "ghost50", name: "Ghost 50%", apply: randomTransparency(50) },
];
