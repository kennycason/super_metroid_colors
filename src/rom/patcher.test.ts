import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRom } from "./patcher";
import { EFFECTS } from "./effects";
import { REGIONS } from "./regions";
import {
  headerOffset,
  readPalette,
  writePalette,
  bgr555ToRgb,
  rgbToBgr555,
  rgbToHsv,
  hsvToRgb,
} from "./palette";
import { decompressLZ5, compressLZ5, snesToPc } from "./lz5";
import {
  readTilesetTable,
  decompressTilesetPalette,
  patchTilesetPalettes,
  lz5CompressedSize,
} from "./tilesets";

const __dirname = dirname(fileURLToPath(import.meta.url));

let rom: Uint8Array<ArrayBuffer>;

beforeAll(() => {
  const buf = readFileSync(resolve(__dirname, "test-rom.smc"));
  rom = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
});

describe("ROM loading", () => {
  it("loads a valid ROM", () => {
    expect(rom.length).toBe(3 * 1024 * 1024);
  });

  it("validates successfully", () => {
    expect(validateRom(rom)).toBeNull();
  });
});

describe("color math", () => {
  it("roundtrips BGR555 -> RGB -> BGR555", () => {
    for (const color of [0x0000, 0x7fff, 0x001f, 0x03e0, 0x7c00, 0x1234]) {
      const { r, g, b } = bgr555ToRgb(color);
      expect(rgbToBgr555(r, g, b)).toBe(color);
    }
  });

  it("roundtrips RGB -> HSV -> RGB", () => {
    for (const [r, g, b] of [[15, 20, 10], [31, 0, 0], [0, 31, 0], [0, 0, 31], [16, 16, 16]]) {
      const hsv = rgbToHsv(r, g, b);
      const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
      expect(rgb.r).toBeCloseTo(r, 0);
      expect(rgb.g).toBeCloseTo(g, 0);
      expect(rgb.b).toBeCloseTo(b, 0);
    }
  });
});

describe("region bounds", () => {
  it("all regions contain valid BGR555 data", () => {
    const hdr = headerOffset(rom);
    for (const region of REGIONS) {
      const offset = region.offset + hdr;
      expect(offset + region.colorCount * 2).toBeLessThanOrEqual(rom.length);
      const colors = readPalette(rom, offset, Math.min(region.colorCount, 16));
      for (const c of colors) {
        expect(c).toBeLessThanOrEqual(0x7fff);
      }
    }
  });

  it("all region colors are valid BGR555 (no code overlap)", () => {
    const hdr = headerOffset(rom);
    for (const region of REGIONS) {
      const offset = region.offset + hdr;
      // Check EVERY color, not just first 16
      for (let i = 0; i < region.colorCount; i++) {
        const lo = rom[offset + i * 2];
        const hi = rom[offset + i * 2 + 1];
        const c = lo | (hi << 8);
        expect(c).toBeLessThanOrEqual(0x7fff);
      }
    }
  });

  it("no region overlaps another", () => {
    const hdr = headerOffset(rom);
    for (let i = 0; i < REGIONS.length; i++) {
      const a = REGIONS[i];
      const aStart = a.offset + hdr;
      const aEnd = aStart + a.colorCount * 2;
      for (let j = i + 1; j < REGIONS.length; j++) {
        const b = REGIONS[j];
        const bStart = b.offset + hdr;
        const bEnd = bStart + b.colorCount * 2;
        const overlaps = aStart < bEnd && bStart < aEnd;
        if (overlaps) {
          throw new Error(`OVERLAP: ${a.name} [${aStart.toString(16)}-${aEnd.toString(16)}] overlaps ${b.name} [${bStart.toString(16)}-${bEnd.toString(16)}]`);
        }
      }
    }
  });
});

describe("enemy palette validation (vanilla ROM)", () => {
  let vanillaRom: Uint8Array<ArrayBuffer>;

  beforeAll(() => {
    try {
      const buf = readFileSync(resolve(__dirname, "vanilla-rom.smc"));
      vanillaRom = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      // vanilla ROM not available, skip
    }
  });

  it("all enemy/boss regions have valid BGR555 in vanilla ROM", () => {
    if (!vanillaRom) return; // skip if no vanilla ROM
    const hdr = headerOffset(vanillaRom);
    const enemyAndBossRegions = REGIONS.filter(r => r.category === "enemies" || r.category === "bosses");
    for (const region of enemyAndBossRegions) {
      const offset = region.offset + hdr;
      expect(offset + region.colorCount * 2).toBeLessThanOrEqual(vanillaRom.length);
      for (let i = 0; i < region.colorCount; i++) {
        const lo = vanillaRom[offset + i * 2];
        const hi = vanillaRom[offset + i * 2 + 1];
        const c = lo | (hi << 8);
        if (c > 0x7fff) {
          throw new Error(`${region.name} color ${i} at 0x${(offset + i * 2).toString(16)} = 0x${c.toString(16)} > 0x7FFF`);
        }
      }
    }
  });

  it("enemy palette offsets match species header derivation in vanilla ROM", () => {
    if (!vanillaRom) return;
    const hdr = headerOffset(vanillaRom);

    function snesToPcLocal(snesAddr: number): number {
      const bank = (snesAddr >> 16) & 0xFF;
      const addr = snesAddr & 0xFFFF;
      return hdr + ((bank & 0x7F) * 0x8000) + (addr & 0x7FFF);
    }
    function readU8(offset: number) { return vanillaRom[offset]; }
    function readU16(offset: number) { return vanillaRom[offset] | (vanillaRom[offset + 1] << 8); }

    // Species IDs for bosses/enemies we added
    const speciesMap: Record<string, number> = {
      boss_spore_spawn: 0xDF3F,
      boss_ridley: 0xE17F,
      boss_kraid: 0xE2BF,
      boss_phantoon: 0xE4BF,
      boss_draygon: 0xDE3F,
      boss_crocomire: 0xDDBF,
      boss_mother_brain: 0xEC3F,
      boss_botwoon: 0xF293,
      boss_torizo: 0xEEFF,
      boss_big_metroid: 0xEEBF,
      boss_mini_kraid: 0xE0FF,
      enemy_metroid: 0xDD7F,
      enemy_zoomer: 0xDCFF,
      enemy_ripper: 0xD47F,
      enemy_sidehopper: 0xD93F,
      enemy_space_pirate: 0xF353,
      enemy_kihunter_green: 0xEABF,
    };

    for (const [regionId, speciesId] of Object.entries(speciesMap)) {
      const region = REGIONS.find(r => r.id === regionId);
      if (!region) continue;
      const headerPc = snesToPcLocal(0xA00000 | speciesId);
      const palPtr = readU16(headerPc + 2);
      const aiBank = readU8(headerPc + 0x0C);
      const palSnes = (aiBank << 16) | (palPtr & 0xFFFF);
      const palPc = snesToPcLocal(palSnes) - hdr; // convert back to unheadered offset
      expect(palPc).toBe(region.offset);
    }
  });
});

describe("effect preview (scratch buffer only)", () => {
  it("effects do not mutate the ROM", () => {
    const origBytes = rom.slice(0x0d9400, 0x0d9400 + 32);
    const colors = readPalette(rom, 0x0d9400, 16);
    const buf = new Uint8Array(32);
    writePalette(buf, 0, colors);
    EFFECTS.find(e => e.id === "grayscale")!.apply(buf, 0, 16);
    expect(rom.slice(0x0d9400, 0x0d9400 + 32)).toEqual(origBytes);
    expect(readPalette(buf, 0, 16)).not.toEqual(colors);
  });

  it("invert twice is identity", () => {
    const colors = readPalette(rom, 0x0d9400, 16);
    const buf = new Uint8Array(32);
    writePalette(buf, 0, colors);
    const invert = EFFECTS.find(e => e.id === "invert")!;
    invert.apply(buf, 0, 16);
    invert.apply(buf, 0, 16);
    expect(readPalette(buf, 0, 16)).toEqual(colors);
  });
});

describe("LZ5 decompressor", () => {
  it("decompresses tileset 0 palette to 256 bytes", () => {
    const tilesets = readTilesetTable(rom);
    const palette = decompressTilesetPalette(rom, tilesets[0].palettePcOffset);
    expect(palette.length).toBe(256);
  });

  it("all 29 tilesets decompress to 256 bytes of valid BGR555", () => {
    const tilesets = readTilesetTable(rom);
    for (const ts of tilesets) {
      const palette = decompressTilesetPalette(rom, ts.palettePcOffset);
      expect(palette.length).toBe(256);
      for (let i = 0; i < 256; i += 2) {
        const c = palette[i] | (palette[i + 1] << 8);
        expect(c).toBeLessThanOrEqual(0x7fff);
      }
    }
  });
});

describe("LZ5 compressor roundtrip", () => {
  it("compress -> decompress produces identical data", () => {
    const tilesets = readTilesetTable(rom);
    for (const ts of tilesets) {
      const original = decompressTilesetPalette(rom, ts.palettePcOffset);
      const compressed = compressLZ5(original);
      const roundtrip = decompressLZ5(compressed, 0);
      expect(roundtrip.slice(0, 256)).toEqual(original);
    }
  });
});

describe("tileset palette patching", () => {
  it("patchTilesetPalettes modifies palette data", () => {
    const grayscale = EFFECTS.find(e => e.id === "grayscale")!;
    const patched = patchTilesetPalettes(new Uint8Array(rom) as Uint8Array<ArrayBuffer>, [grayscale.apply]);

    // Re-read tileset 7 (Green Brinstar) palette from patched ROM
    const tilesets = readTilesetTable(patched);
    const patchedPalette = decompressTilesetPalette(patched, tilesets[7].palettePcOffset);
    const origPalette = decompressTilesetPalette(rom, tilesets[7].palettePcOffset);

    // All non-zero colors should be grayscale (r == g == b)
    for (let i = 0; i < 256; i += 2) {
      const c = patchedPalette[i] | (patchedPalette[i + 1] << 8);
      if (c === 0) continue;
      const { r, g, b } = bgr555ToRgb(c);
      expect(r).toBe(g);
      expect(g).toBe(b);
    }

    // Should differ from original
    expect(patchedPalette).not.toEqual(origPalette);
  });

  it("does not mutate original ROM", () => {
    const origSlice = rom.slice(0, 100);
    const grayscale = EFFECTS.find(e => e.id === "grayscale")!;
    patchTilesetPalettes(new Uint8Array(rom) as Uint8Array<ArrayBuffer>, [grayscale.apply]);
    expect(rom.slice(0, 100)).toEqual(origSlice);
  });

  it("completes in under 500ms", () => {
    const grayscale = EFFECTS.find(e => e.id === "grayscale")!;
    const start = performance.now();
    patchTilesetPalettes(new Uint8Array(rom) as Uint8Array<ArrayBuffer>, [grayscale.apply]);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("all patched tilesets decompress to valid 256-byte palettes", () => {
    const grayscale = EFFECTS.find(e => e.id === "grayscale")!;
    const patched = patchTilesetPalettes(new Uint8Array(rom) as Uint8Array<ArrayBuffer>, [grayscale.apply]);
    const tilesets = readTilesetTable(patched);
    for (const ts of tilesets) {
      const palette = decompressTilesetPalette(patched, ts.palettePcOffset);
      expect(palette.length).toBe(256);
      for (let i = 0; i < 256; i += 2) {
        const c = palette[i] | (palette[i + 1] << 8);
        expect(c).toBeLessThanOrEqual(0x7fff);
      }
    }
  });

  it("compressed output roundtrips correctly for all tilesets", () => {
    const grayscale = EFFECTS.find(e => e.id === "grayscale")!;
    const tilesets = readTilesetTable(rom);
    const seen = new Set<number>();
    for (const ts of tilesets) {
      if (seen.has(ts.palettePcOffset)) continue;
      seen.add(ts.palettePcOffset);
      const palette = decompressTilesetPalette(rom, ts.palettePcOffset);
      const modified = palette.slice(0, 256);
      grayscale.apply(modified, 0, 128);
      const compressed = compressLZ5(modified);
      const roundtrip = decompressLZ5(compressed, 0);
      expect(roundtrip.slice(0, 256)).toEqual(modified);
    }
  });

  it("tileset palette offsets do not overlap with uncompressed regions", () => {
    const hdr = headerOffset(rom);
    const tilesets = readTilesetTable(rom);
    const seen = new Set<number>();
    const uncompressedRegions = REGIONS.map(r => ({
      name: r.name, start: r.offset + hdr, end: r.offset + hdr + r.colorCount * 2
    }));
    for (const ts of tilesets) {
      if (seen.has(ts.palettePcOffset)) continue;
      seen.add(ts.palettePcOffset);
      const compSize = lz5CompressedSize(rom, ts.palettePcOffset);
      const tsStart = ts.palettePcOffset;
      const tsEnd = ts.palettePcOffset + compSize;
      for (const r of uncompressedRegions) {
        const overlaps = tsStart < r.end && tsEnd > r.start;
        if (overlaps) {
          console.log(`OVERLAP: ${ts.name} [${tsStart.toString(16)}-${tsEnd.toString(16)}] overlaps ${r.name} [${r.start.toString(16)}-${r.end.toString(16)}]`);
        }
        expect(overlaps).toBe(false);
      }
    }
  });

  it("patched ROM has no adjacent data corruption", () => {
    // Verify that writing compressed palettes doesn't overwrite non-palette data
    const grayscale = EFFECTS.find(e => e.id === "grayscale")!;
    const romCopy = new Uint8Array(rom) as Uint8Array<ArrayBuffer>;
    const patched = patchTilesetPalettes(romCopy, [grayscale.apply]);
    const tilesets = readTilesetTable(rom);
    const seen = new Set<number>();

    // Collect all palette regions (offset + original compressed size)
    const paletteRegions: { start: number; end: number; name: string }[] = [];
    for (const ts of tilesets) {
      if (seen.has(ts.palettePcOffset)) continue;
      seen.add(ts.palettePcOffset);
      const origSize = lz5CompressedSize(rom, ts.palettePcOffset);
      paletteRegions.push({ start: ts.palettePcOffset, end: ts.palettePcOffset + origSize, name: ts.name });
    }

    // Check that bytes OUTSIDE palette regions are unchanged
    let changedOutside = 0;
    for (let i = 0; i < Math.min(rom.length, patched.length); i++) {
      if (rom[i] !== patched[i]) {
        const inPalette = paletteRegions.some(r => i >= r.start && i < r.end);
        if (!inPalette) {
          changedOutside++;
          if (changedOutside <= 5) {
            const region = paletteRegions.find(r => Math.abs(i - r.end) < 10 || Math.abs(i - r.start) < 10);
            console.log(`Byte ${i.toString(16)} changed (${rom[i]} → ${patched[i]}) OUTSIDE palette regions${region ? ` near ${region.name}` : ''}`);
          }
        }
      }
    }
    if (changedOutside > 0) console.log(`Total ${changedOutside} bytes changed outside palette regions!`);
    expect(changedOutside).toBe(0);
  });

  it("full download pipeline produces correct ROM", () => {
    // Replicate the exact download pipeline from App.tsx
    let patched = new Uint8Array(rom) as Uint8Array<ArrayBuffer>;
    const hdr = headerOffset(patched);
    const grayscale = EFFECTS.find(e => e.id === "grayscale")!;
    const effectFns = [grayscale.apply];

    // Step 1: Apply to uncompressed regions (same as handleDownload)
    for (const effectFn of effectFns) {
      for (const region of REGIONS) {
        const offset = region.offset + hdr;
        if (offset + region.colorCount * 2 <= patched.length) {
          effectFn(patched, offset, region.colorCount);
        }
      }
    }

    // Step 2: Apply to tilesets (same as handleDownload)
    patched = patchTilesetPalettes(patched, effectFns);

    // Verify: Samus power suit should be grayscale
    const samusColors = readPalette(patched, 0x0d9400 + hdr, 16);
    for (const c of samusColors) {
      if (c === 0) continue;
      const { r, g, b } = bgr555ToRgb(c);
      expect(r).toBe(g);
      expect(g).toBe(b);
    }

    // Verify: tileset palettes should be grayscale
    const tilesets = readTilesetTable(patched);
    for (const ts of tilesets) {
      const palette = decompressTilesetPalette(patched, ts.palettePcOffset);
      for (let i = 0; i < 256; i += 2) {
        const c = palette[i] | (palette[i + 1] << 8);
        if (c === 0) continue;
        const { r, g, b } = bgr555ToRgb(c);
        expect(r).toBe(g);
        expect(g).toBe(b);
      }
    }

    // Verify: ROM size unchanged (no relocations needed)
    expect(patched.length).toBe(rom.length);
  });

  it("compressed output matches reference SNES decompressor", () => {
    // Reference decompressor matching SNES behavior exactly (from Kotlin LZ5Compressor.decompress)
    function snesDecompress(compressed: Uint8Array): Uint8Array {
      const dst = new Uint8Array(0x20000);
      let dstPos = 0, pos = 0;
      while (pos < compressed.length) {
        const nextCmd = compressed[pos];
        if (nextCmd === 0xff) break;
        let cmdCode: number, length: number;
        const topBits = (nextCmd >> 5) & 7;
        if (topBits === 7) {
          if (pos + 1 >= compressed.length) break;
          cmdCode = (nextCmd >> 2) & 7;
          length = (((nextCmd & 0x03) << 8) | compressed[pos + 1]) + 1;
          pos += 2;
        } else {
          cmdCode = topBits;
          length = (nextCmd & 0x1f) + 1;
          pos += 1;
        }
        switch (cmdCode) {
          case 0:
            for (let i = 0; i < length; i++) {
              if (pos >= compressed.length) break;
              dst[dstPos++] = compressed[pos++];
            }
            break;
          case 1: { const b = compressed[pos++]; for (let i = 0; i < length; i++) dst[dstPos++] = b; break; }
          case 2: { const b1 = compressed[pos++], b2 = compressed[pos++]; for (let i = 0; i < length; i++) dst[dstPos++] = i % 2 === 0 ? b1 : b2; break; }
          case 3: { let b = compressed[pos++]; for (let i = 0; i < length; i++) { dst[dstPos++] = b & 0xff; b = (b + 1) & 0xff; } break; }
          case 4: {
            const addr = (compressed[pos] & 0xff) | ((compressed[pos + 1] & 0xff) << 8);
            pos += 2;
            for (let i = 0; i < length; i++) {
              const si = addr + i;
              dst[dstPos + i] = (si < dstPos + i) ? dst[si] : 0;
            }
            dstPos += length;
            break;
          }
          case 5: {
            const addr = (compressed[pos] & 0xff) | ((compressed[pos + 1] & 0xff) << 8);
            pos += 2;
            for (let i = 0; i < length; i++) {
              const si = addr + i;
              dst[dstPos + i] = (si < dstPos + i) ? (dst[si] ^ 0xff) : 0xff;
            }
            dstPos += length;
            break;
          }
          case 6: {
            const relOff = compressed[pos++];
            const srcAddr = dstPos - relOff;
            for (let i = 0; i < length; i++) {
              const si = srcAddr + i;
              dst[dstPos + i] = (si >= 0 && si < dstPos + i) ? dst[si] : 0;
            }
            dstPos += length;
            break;
          }
          case 7: {
            const relOff = compressed[pos++];
            const srcAddr = dstPos - relOff;
            for (let i = 0; i < length; i++) {
              const si = srcAddr + i;
              dst[dstPos + i] = (si >= 0 && si < dstPos + i) ? (dst[si] ^ 0xff) : 0xff;
            }
            dstPos += length;
            break;
          }
        }
        if (dstPos >= dst.length) break;
      }
      return dst.slice(0, dstPos);
    }

    const tilesets = readTilesetTable(rom);
    const seen = new Set<number>();
    const grayscale = EFFECTS.find(e => e.id === "grayscale")!;
    for (const ts of tilesets) {
      if (seen.has(ts.palettePcOffset)) continue;
      seen.add(ts.palettePcOffset);
      const palette = decompressTilesetPalette(rom, ts.palettePcOffset);
      const modified = palette.slice(0, 256);
      grayscale.apply(modified, 0, 128);
      const compressed = compressLZ5(modified);

      // Verify SNES reference decompressor produces same output
      const snesResult = snesDecompress(compressed);
      const ourResult = decompressLZ5(compressed, 0);

      if (!snesResult.slice(0, 256).every((b, i) => b === modified[i])) {
        const diffIdx = Array.from(modified).findIndex((b, i) => snesResult[i] !== b);
        console.log(`TS${ts.index} ${ts.name}: SNES decompressor MISMATCH at byte ${diffIdx}! snes=${snesResult[diffIdx]} expected=${modified[diffIdx]}`);
      }
      expect(snesResult.slice(0, 256)).toEqual(modified);
    }
  });

  it("recompressed identity (no effect) produces SNES-compatible output", () => {
    // Decompress, recompress without changes, verify byte-perfect roundtrip
    const tilesets = readTilesetTable(rom);
    const seen = new Set<number>();
    for (const ts of tilesets) {
      if (seen.has(ts.palettePcOffset)) continue;
      seen.add(ts.palettePcOffset);
      const original = decompressTilesetPalette(rom, ts.palettePcOffset);
      const compressed = compressLZ5(original);
      // Verify our decompressor can read it back
      const rt = decompressLZ5(compressed, 0);
      expect(rt.slice(0, 256)).toEqual(original);
      // Verify no 0xFF in command positions (would cause early termination)
      let pos = 0;
      while (pos < compressed.length - 1) { // last byte is 0xFF terminator
        expect(compressed[pos]).not.toBe(0xff);
        const topBits = (compressed[pos] >> 5) & 7;
        if (topBits === 7) {
          pos += 2; // extended header
        } else {
          pos += 1;
        }
        const cmdCode = topBits === 7 ? (compressed[pos - (topBits === 7 ? 2 : 1)] >> 2) & 7 : topBits;
        const length = topBits === 7
          ? (((compressed[pos - 2] & 3) << 8) | compressed[pos - 1]) + 1
          : (compressed[pos - 1] & 0x1f) + 1;
        switch (cmdCode) {
          case 0: pos += length; break;
          case 1: pos += 1; break;
          case 2: pos += 2; break;
          case 3: pos += 1; break;
          case 4: case 5: pos += 2; break;
          case 6: case 7: pos += 1; break;
        }
      }
      expect(compressed[compressed.length - 1]).toBe(0xff);
    }
  });
});

describe("all effects produce valid BGR555 output", () => {
  for (const effect of EFFECTS) {
    it(effect.name, () => {
      const colors = readPalette(rom, 0x0d9400, 16);
      const buf = new Uint8Array(32);
      writePalette(buf, 0, colors);
      effect.apply(buf, 0, 16);
      for (const c of readPalette(buf, 0, 16)) {
        expect(c).toBeLessThanOrEqual(0x7fff);
      }
    });
  }
});

describe("new effects behavior", () => {
  function makeTestBuf(colors: number[]): Uint8Array {
    const buf = new Uint8Array(colors.length * 2);
    writePalette(buf, 0, colors);
    return buf;
  }

  it("rainbow assigns distinct hues across palette", () => {
    const effect = EFFECTS.find(e => e.id === "rainbow")!;
    // White colors with different brightnesses
    const colors = [0, 0x7fff, 0x5294, 0x318c, 0x1084];
    const buf = makeTestBuf(colors);
    effect.apply(buf, 0, colors.length);
    const result = readPalette(buf, 0, colors.length);
    // Index 0 stays transparent
    expect(result[0]).toBe(0);
    // Other colors should be different from each other (different hues)
    const unique = new Set(result.filter(c => c !== 0));
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });

  it("cyberpunk produces high-contrast neon colors", () => {
    const effect = EFFECTS.find(e => e.id === "cyberpunk")!;
    const colors = [0, 0x7fff, 0x0421]; // transparent, white, dark gray
    const buf = makeTestBuf(colors);
    effect.apply(buf, 0, colors.length);
    const result = readPalette(buf, 0, colors.length);
    expect(result[0]).toBe(0);
    // White (high lum) should have strong red + blue components
    const bright = bgr555ToRgb(result[1]);
    expect(bright.r).toBe(31); // bright pixels get max red
  });

  it("complementary shifts hue by 180 degrees", () => {
    const effect = EFFECTS.find(e => e.id === "complementary")!;
    // Pure red in BGR555: r=31, g=0, b=0
    const pureRed = rgbToBgr555(31, 0, 0);
    const buf = makeTestBuf([0, pureRed]);
    effect.apply(buf, 0, 2);
    const result = readPalette(buf, 0, 2);
    // Complementary of red should be cyan-ish (high green + blue)
    const comp = bgr555ToRgb(result[1]);
    expect(comp.g).toBeGreaterThan(15);
    expect(comp.b).toBeGreaterThan(15);
    expect(comp.r).toBeLessThan(10);
  });

  it("thermal maps luminance to heat colors", () => {
    const effect = EFFECTS.find(e => e.id === "thermal")!;
    // Dark color -> should be blue-ish
    const dark = rgbToBgr555(2, 2, 2);
    // Bright color -> should be yellow/white
    const bright = rgbToBgr555(28, 28, 28);
    const buf = makeTestBuf([0, dark, bright]);
    effect.apply(buf, 0, 3);
    const result = readPalette(buf, 0, 3);
    const darkResult = bgr555ToRgb(result[1]);
    const brightResult = bgr555ToRgb(result[2]);
    // Dark should be blue-dominant
    expect(darkResult.b).toBeGreaterThan(darkResult.r);
    // Bright should have high red
    expect(brightResult.r).toBe(31);
  });

  it("acid maximizes saturation", () => {
    const effect = EFFECTS.find(e => e.id === "acid")!;
    const muted = rgbToBgr555(15, 12, 10); // desaturated brownish
    const buf = makeTestBuf([0, muted]);
    effect.apply(buf, 0, 2);
    const result = readPalette(buf, 0, 2);
    const hsv = rgbToHsv(...Object.values(bgr555ToRgb(result[1])) as [number, number, number]);
    // Saturation should be maxed out
    expect(hsv.s).toBeCloseTo(1.0, 1);
  });

  it("ghost transparency zeroes some colors deterministically", () => {
    const effect = EFFECTS.find(e => e.id === "ghost50")!;
    // Use 16 non-zero colors
    const colors = Array.from({ length: 16 }, (_, i) => rgbToBgr555(i + 1, i + 1, i + 1));
    const buf1 = makeTestBuf(colors);
    const buf2 = makeTestBuf(colors);
    effect.apply(buf1, 0, 16);
    effect.apply(buf2, 0, 16);
    const r1 = readPalette(buf1, 0, 16);
    const r2 = readPalette(buf2, 0, 16);
    // Should be deterministic (same input → same output)
    expect(r1).toEqual(r2);
    // Should have some zeros and some non-zeros
    const zeros = r1.filter(c => c === 0).length;
    expect(zeros).toBeGreaterThan(0);
    expect(zeros).toBeLessThan(16);
  });

  it("hologram produces varied hues based on index", () => {
    const effect = EFFECTS.find(e => e.id === "hologram")!;
    const colors = [0, 0x7fff, 0x5294, 0x318c, 0x1084, 0x7fff, 0x5294, 0x318c];
    const buf = makeTestBuf(colors);
    effect.apply(buf, 0, colors.length);
    const result = readPalette(buf, 0, colors.length);
    // Same brightness colors at different indices should have different hues
    expect(result[1]).not.toBe(result[5]); // same color at index 1 vs 5
  });

  it("triadic shifts hue by 120 degrees", () => {
    const effect = EFFECTS.find(e => e.id === "triadic")!;
    const pureRed = rgbToBgr555(31, 0, 0);
    const buf = makeTestBuf([0, pureRed]);
    effect.apply(buf, 0, 2);
    const result = readPalette(buf, 0, 2);
    const shifted = bgr555ToRgb(result[1]);
    // 120 degrees from red should be green-ish
    expect(shifted.g).toBeGreaterThan(shifted.r);
  });
});
