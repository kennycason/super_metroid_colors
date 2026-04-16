/**
 * Tileset palette handling for Super Metroid.
 *
 * Tileset palettes are LZ5-compressed and referenced via a pointer table
 * at $8F:E6A2 (PC 0x07E6A2). Each tileset has 8 sub-palettes × 16 colors = 256 bytes.
 */

import { decompressLZ5, compressLZ5, snesToPc } from "./lz5";
import { headerOffset } from "./palette";
import type { EffectFn } from "./effects";

const TILESET_TABLE_PC = 0x07e6a2;
const TILESET_COUNT = 29;
const PALETTE_BYTES = 256; // 8 palettes × 16 colors × 2 bytes

export interface TilesetInfo {
  index: number;
  name: string;
  paletteSnesPtr: number;
  palettePcOffset: number;
}

const TILESET_NAMES = [
  "Crateria Surface (cave)", "Crateria Surface (open)", "Crateria / Blue Brinstar",
  "Red Crateria", "Old Tourian", "Wrecked Ship (off)",
  "Wrecked Ship (on)", "Green Brinstar", "Red Brinstar",
  "Pre-Kraid / Warehouse", "Upper Norfair", "Lower Norfair",
  "Inner Maridia", "Outer Maridia", "Tourian 1",
  "Tourian 2", "Mother Brain", "Ceres",
  "Ceres Elevator", "Blue Crateria (alt)", "Green Brinstar (alt)",
  "Crateria (dark)", "Kraid Room", "Crocomire Room",
  "Draygon Room", "Unused 1", "Unused 2",
  "Debug", "Title Screen",
];

/**
 * Read the tileset pointer table from ROM and return info about each tileset.
 */
export function readTilesetTable(rom: Uint8Array): TilesetInfo[] {
  const hdr = headerOffset(rom);
  const tableOffset = TILESET_TABLE_PC + hdr;
  const tilesets: TilesetInfo[] = [];

  for (let i = 0; i < TILESET_COUNT; i++) {
    const entryOffset = tableOffset + i * 9;
    const palPtr = rom[entryOffset + 6] | (rom[entryOffset + 7] << 8) | (rom[entryOffset + 8] << 16);
    tilesets.push({
      index: i,
      name: TILESET_NAMES[i],
      paletteSnesPtr: palPtr,
      palettePcOffset: snesToPc(palPtr) + hdr,
    });
  }

  return tilesets;
}

/**
 * Get the unique tileset palette locations (some tilesets share palette pointers).
 */
export function getUniquePaletteOffsets(tilesets: TilesetInfo[]): Map<number, TilesetInfo[]> {
  const map = new Map<number, TilesetInfo[]>();
  for (const ts of tilesets) {
    const existing = map.get(ts.palettePcOffset);
    if (existing) existing.push(ts);
    else map.set(ts.palettePcOffset, [ts]);
  }
  return map;
}

/**
 * Decompress a tileset palette from ROM.
 * Returns 256 bytes of raw BGR555 palette data (8 × 16 colors).
 */
export function decompressTilesetPalette(rom: Uint8Array, pcOffset: number): Uint8Array {
  const hdr = headerOffset(rom);
  const rawPc = pcOffset - hdr; // decompressLZ5 works on raw ROM offsets
  const data = decompressLZ5(rom, rawPc + hdr);
  return data.slice(0, PALETTE_BYTES);
}

/**
 * Find the compressed size of LZ5 data starting at pcOffset.
 */
export function lz5CompressedSize(rom: Uint8Array, pcOffset: number): number {
  let pos = pcOffset;
  while (pos < rom.length) {
    const cmd = rom[pos];
    if (cmd === 0xff) return pos - pcOffset + 1;
    const topBits = (cmd >> 5) & 7;
    let length: number;
    if (topBits === 7) {
      length = (((cmd & 3) << 8) | rom[pos + 1]) + 1;
      pos += 2;
    } else {
      length = (cmd & 0x1f) + 1;
      pos += 1;
    }
    const cmdCode = topBits === 7 ? (cmd >> 2) & 7 : topBits;
    switch (cmdCode) {
      case 0: pos += length; break;
      case 1: pos += 1; break;
      case 2: pos += 2; break;
      case 3: pos += 1; break;
      case 4: case 5: pos += 2; break;
      case 6: case 7: pos += 1; break;
    }
  }
  return pos - pcOffset;
}

/**
 * Apply effects to all tileset palettes and write them back into the ROM.
 * Handles recompression — writes in-place if it fits, otherwise appends to ROM end.
 *
 * Returns a potentially larger ROM if any palettes needed to be relocated.
 */
export function patchTilesetPalettes(
  rom: Uint8Array<ArrayBuffer>,
  effects: EffectFn[],
  colorOverrides?: Map<string, number>,
): Uint8Array<ArrayBuffer> {
  const hasOverrides = colorOverrides && [...colorOverrides.keys()].some(k => k.startsWith("tileset:"));
  if (effects.length === 0 && !hasOverrides) return rom;

  const tilesets = readTilesetTable(rom);
  const uniqueOffsets = getUniquePaletteOffsets(tilesets);
  const hdr = headerOffset(rom);

  // Phase 1: Decompress ALL palettes and compute original sizes BEFORE any writes.
  // This prevents reading from a buffer we've already modified.
  const patches: {
    pcOffset: number;
    sharedTilesets: TilesetInfo[];
    compressed: Uint8Array;
    origSize: number;
  }[] = [];

  for (const [pcOffset, sharedTilesets] of uniqueOffsets) {
    const palette = decompressLZ5(rom, pcOffset);
    if (palette.length < PALETTE_BYTES) continue;

    const modified = palette.slice(0, PALETTE_BYTES);
    for (const effectFn of effects) {
      effectFn(modified, 0, PALETTE_BYTES / 2);
    }

    // Apply per-color overrides for this tileset
    if (colorOverrides) {
      for (const [key, bgr555] of colorOverrides) {
        if (!key.startsWith("tileset:")) continue;
        const parts = key.split(":");
        const overridePcOffset = parseInt(parts[1]);
        if (overridePcOffset !== pcOffset) continue;
        const colorIdx = parseInt(parts[2]);
        if (colorIdx >= 0 && colorIdx * 2 + 1 < modified.length) {
          modified[colorIdx * 2] = bgr555 & 0xff;
          modified[colorIdx * 2 + 1] = (bgr555 >> 8) & 0xff;
        }
      }
    }

    patches.push({
      pcOffset,
      sharedTilesets,
      compressed: compressLZ5(modified),
      origSize: lz5CompressedSize(rom, pcOffset),
    });
  }

  // Phase 2: Write all patches back
  let result = rom;
  let appendOffset = rom.length;

  for (const { pcOffset, sharedTilesets, compressed, origSize } of patches) {
    if (compressed.length <= origSize) {
      result.set(compressed, pcOffset);
      for (let i = compressed.length; i < origSize; i++) {
        result[pcOffset + i] = 0xff;
      }
    } else {
      const newRom = new Uint8Array(appendOffset + compressed.length);
      newRom.set(result);
      newRom.set(compressed, appendOffset);
      result = newRom;

      const newPcOffset = appendOffset - hdr;
      const bank = ((newPcOffset >> 15) & 0x7f) | 0x80;
      const snesOffset = (newPcOffset & 0x7fff) + 0x8000;
      const newSnesPtr = (bank << 16) | snesOffset;

      for (const ts of sharedTilesets) {
        const entryOffset = TILESET_TABLE_PC + hdr + ts.index * 9;
        result[entryOffset + 6] = newSnesPtr & 0xff;
        result[entryOffset + 7] = (newSnesPtr >> 8) & 0xff;
        result[entryOffset + 8] = (newSnesPtr >> 16) & 0xff;
      }

      appendOffset += compressed.length;
    }
  }

  return result;
}
