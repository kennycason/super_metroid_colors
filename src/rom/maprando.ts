/**
 * Map Rando detection and area palette handling.
 *
 * Map Rando relocates environment palettes to expanded ROM banks $C0/$C1.
 * Each area (Crateria, Brinstar, etc.) has its own set of 32 tileset palettes
 * stored as raw BGR555 data wrapped in trivial LZ5 literal headers.
 *
 * Samus, beam, and boss palettes remain at their vanilla offsets.
 */

import { headerOffset } from "./palette";
import { snesToPc } from "./lz5";
import { EFFECTS, type EffectFn } from "./effects";

// Map Rando hooks "load state header" at SNES $82:DF1D with a JSL to GetPalettePointer.
// In vanilla SM the byte here is 0xBD (LDA abs,X); Map Rando replaces it with 0x22 (JSL).
const PALETTE_HOOK_PC = 0x015f1d;
const JSL_OPCODE = 0x22;

const AREA_COUNT = 8;
const TILESETS_PER_AREA = 32;
const ENTRY_BYTES = 3; // 24-bit SNES pointer
const TABLE_BYTES = TILESETS_PER_AREA * ENTRY_BYTES; // 96
const PALETTE_DATA_BYTES = 256; // 8 subpalettes × 16 colors × 2 bytes

// Each PaletteSet: 96-byte pointer table + 22 palette files × 260 bytes = 5816 bytes
const PALETTE_SET_BYTES = 96 + 22 * 260;

const AREA_NAMES = [
  "Crateria", "Brinstar", "Norfair", "Wrecked Ship",
  "Maridia", "Tourian", "Debug 6", "Debug 7",
];

// PC addresses of each area's pointer table (unheadered)
const BANK_C0_PC = 0x200000;
const BANK_C1_PC = 0x208000;
const AREA_TABLE_PC = [
  BANK_C0_PC + 0 * PALETTE_SET_BYTES,
  BANK_C0_PC + 1 * PALETTE_SET_BYTES,
  BANK_C0_PC + 2 * PALETTE_SET_BYTES,
  BANK_C0_PC + 3 * PALETTE_SET_BYTES,
  BANK_C0_PC + 4 * PALETTE_SET_BYTES,
  BANK_C1_PC + 0 * PALETTE_SET_BYTES,
  BANK_C1_PC + 1 * PALETTE_SET_BYTES,
  BANK_C1_PC + 2 * PALETTE_SET_BYTES,
];

export interface MapRandoPaletteInfo {
  area: number;
  areaName: string;
  tilesetIndex: number;
  /** PC offset of actual BGR555 data (after $E0 $FF LZ5 literal header) */
  dataPcOffset: number;
}

const EFFECTS_LOOKUP = new Map(EFFECTS.map(e => [e.id, e.apply]));

/**
 * Detect whether a ROM is a Map Rando ROM by checking for the JSL palette hook
 * at SNES $82:DF1D and valid area palette data at $C0:8000.
 */
export function isMapRando(rom: Uint8Array): boolean {
  const hdr = headerOffset(rom);

  // Check for JSL opcode at the palette hook point
  const hookOff = PALETTE_HOOK_PC + hdr;
  if (hookOff >= rom.length || rom[hookOff] !== JSL_OPCODE) return false;

  // Verify area palette data exists at $C0:8000 (PC 0x200000)
  const tableOff = BANK_C0_PC + hdr;
  if (tableOff + TABLE_BYTES > rom.length) return false;

  // Read first pointer entry and verify it points to valid palette data
  const snesPtr = rom[tableOff] | (rom[tableOff + 1] << 8) | (rom[tableOff + 2] << 16);
  const bank = (snesPtr >> 16) & 0xff;
  if (bank !== 0xc0 && bank !== 0xc1) return false;

  const pcOff = snesToPc(snesPtr) + hdr;
  if (pcOff + 2 > rom.length) return false;
  return rom[pcOff] === 0xe0 && rom[pcOff + 1] === 0xff;
}

/**
 * Read all area palette entries from a Map Rando ROM.
 * Returns one entry per area×tileset combination (up to 256), many sharing the same dataPcOffset.
 */
export function readMapRandoPalettes(rom: Uint8Array): MapRandoPaletteInfo[] {
  const hdr = headerOffset(rom);
  const palettes: MapRandoPaletteInfo[] = [];

  for (let area = 0; area < AREA_COUNT; area++) {
    const tableStart = AREA_TABLE_PC[area] + hdr;
    if (tableStart + TABLE_BYTES > rom.length) continue;

    for (let ts = 0; ts < TILESETS_PER_AREA; ts++) {
      const entryOff = tableStart + ts * ENTRY_BYTES;
      const snesPtr = rom[entryOff] | (rom[entryOff + 1] << 8) | (rom[entryOff + 2] << 16);
      const pcOff = snesToPc(snesPtr) + hdr;

      // Validate LZ5 literal header ($E0 $FF = copy 256 bytes)
      if (pcOff + 2 + PALETTE_DATA_BYTES > rom.length) continue;
      if (rom[pcOff] !== 0xe0 || rom[pcOff + 1] !== 0xff) continue;

      palettes.push({
        area,
        areaName: AREA_NAMES[area],
        tilesetIndex: ts,
        dataPcOffset: pcOff + 2,
      });
    }
  }

  return palettes;
}

/**
 * Get unique palette locations from Map Rando palette entries.
 * Returns a map from dataPcOffset → list of palette entries that share it.
 */
export function getUniqueMapRandoPalettes(
  palettes: MapRandoPaletteInfo[],
): Map<number, MapRandoPaletteInfo[]> {
  const map = new Map<number, MapRandoPaletteInfo[]>();
  for (const p of palettes) {
    const existing = map.get(p.dataPcOffset);
    if (existing) existing.push(p);
    else map.set(p.dataPcOffset, [p]);
  }
  return map;
}

/**
 * Build a display name for a shared palette group.
 */
export function mapRandoPaletteName(entries: MapRandoPaletteInfo[]): string {
  // Group by area
  const areas = new Set(entries.map(e => e.areaName));
  const first = entries[0];
  const tsHex = first.tilesetIndex.toString(16).toUpperCase().padStart(2, "0");
  if (areas.size === 1) {
    return `${first.areaName} (${tsHex})`;
  }
  if (areas.size <= 3) {
    return `${[...areas].join("/")} (${tsHex})`;
  }
  return `Shared (${tsHex}) [${areas.size} areas]`;
}

/**
 * Apply effects to all Map Rando area palettes directly in the ROM.
 * No LZ5 compression needed — palette data is stored as raw BGR555.
 */
export function patchMapRandoPalettes(
  rom: Uint8Array<ArrayBuffer>,
  effects: EffectFn[],
  colorOverrides?: Map<string, number>,
  regionEffectOverrides?: Map<string, Set<string>>,
): Uint8Array<ArrayBuffer> {
  const hasOverrides = colorOverrides && [...colorOverrides.keys()].some(k => k.startsWith("tileset:"));
  const hasRegionOverrides = regionEffectOverrides && [...regionEffectOverrides.keys()].some(k => k.startsWith("tileset:"));
  if (effects.length === 0 && !hasOverrides && !hasRegionOverrides) return rom;

  const allPalettes = readMapRandoPalettes(rom);
  const uniquePalettes = getUniqueMapRandoPalettes(allPalettes);

  for (const [dataPcOffset, _entries] of uniquePalettes) {
    const tsKey = `tileset:${dataPcOffset}`;

    // Check for per-region effect overrides
    const regionOverride = regionEffectOverrides?.get(tsKey);
    const effectsToApply: EffectFn[] = regionOverride
      ? [...regionOverride].map(id => EFFECTS_LOOKUP.get(id)).filter((e): e is EffectFn => !!e)
      : effects;

    // Apply effects directly to ROM data (in-place, no copy needed)
    for (const fn of effectsToApply) {
      fn(rom, dataPcOffset, PALETTE_DATA_BYTES / 2);
    }

    // Apply per-color overrides
    if (colorOverrides) {
      for (const [key, bgr555] of colorOverrides) {
        if (!key.startsWith("tileset:")) continue;
        const parts = key.split(":");
        const overrideOffset = parseInt(parts[1]);
        if (overrideOffset !== dataPcOffset) continue;
        const colorIdx = parseInt(parts[2]);
        if (colorIdx >= 0 && colorIdx * 2 + 1 < PALETTE_DATA_BYTES) {
          rom[dataPcOffset + colorIdx * 2] = bgr555 & 0xff;
          rom[dataPcOffset + colorIdx * 2 + 1] = (bgr555 >> 8) & 0xff;
        }
      }
    }
  }

  return rom;
}
