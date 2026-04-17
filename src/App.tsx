import { useState, useEffect, useCallback, useRef, useMemo, memo, startTransition } from "react";
import {
  readPalette,
  bgr555ToRgb,
  rgbToCss,
  rgbToBgr555,
  rgb5to8,
  headerOffset,
  writePalette,
} from "./rom/palette";
import { EFFECTS, type PaletteEffect } from "./rom/effects";
import { REGIONS, CATEGORIES, type PaletteRegion } from "./rom/regions";
import {
  downloadRom,
  validateRom,
  saveRomToStorage,
  loadRomFromStorage,
  clearRomFromStorage,
} from "./rom/patcher";
import {
  readTilesetTable,
  decompressTilesetPalette,
  patchTilesetPalettes,
  type TilesetInfo,
} from "./rom/tilesets";
import "./App.css";

type Category = PaletteRegion["category"] | "all";
type PaletteCategory = "samus" | "environment" | "beams" | "bosses";

interface CachedTileset {
  info: TilesetInfo;
  palette: Uint8Array; // pre-decompressed 256 bytes
}

/** Per-category active effects */
interface CategoryEffects {
  samus: Set<string>;
  environment: Set<string>;
  beams: Set<string>;
  bosses: Set<string>;
}

/** Individual color overrides: key = "regionId:colorIndex" or "tileset:pcOffset:colorIndex" */
type ColorOverrides = Map<string, number>; // BGR555 value

function emptyCategoryEffects(): CategoryEffects {
  return { samus: new Set(), environment: new Set(), beams: new Set(), bosses: new Set() };
}

function App() {
  const romRef = useRef<Uint8Array | null>(null);
  const [romLoaded, setRomLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");
  const [categoryEffects, setCategoryEffects] = useState<CategoryEffects>(emptyCategoryEffects);
  const [colorOverrides, setColorOverrides] = useState<ColorOverrides>(new Map());
  const [romName, setRomName] = useState("super_metroid.smc");
  const [cachedTilesets, setCachedTilesets] = useState<CachedTileset[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Total active effects across all categories (for header count) */
  const totalActiveCount = useMemo(() => {
    const all = new Set<string>();
    for (const s of Object.values(categoryEffects)) {
      for (const id of s) all.add(id);
    }
    return all.size;
  }, [categoryEffects]);

  /** Get the active effects for the current view category */
  const activeEffectsForCategory = useCallback((cat: PaletteCategory): Set<string> => {
    return categoryEffects[cat];
  }, [categoryEffects]);

  /** Compute which effect buttons should appear active in the current view */
  const effectButtonStates = useMemo(() => {
    const states = new Map<string, "active" | "partial" | "inactive">();
    for (const effect of EFFECTS) {
      if (selectedCategory === "all") {
        const cats: PaletteCategory[] = ["samus", "environment", "beams", "bosses"];
        const count = cats.filter(c => categoryEffects[c].has(effect.id)).length;
        if (count === cats.length) states.set(effect.id, "active");
        else if (count > 0) states.set(effect.id, "partial");
        else states.set(effect.id, "inactive");
      } else {
        const cat = selectedCategory as PaletteCategory;
        states.set(effect.id, categoryEffects[cat].has(effect.id) ? "active" : "inactive");
      }
    }
    return states;
  }, [selectedCategory, categoryEffects]);

  /** Decompress all unique tileset palettes and cache them. */
  const cacheTilesets = useCallback((rom: Uint8Array) => {
    const tilesets = readTilesetTable(rom);
    const seen = new Set<number>();
    const cached: CachedTileset[] = [];
    for (const ts of tilesets) {
      if (seen.has(ts.palettePcOffset)) continue;
      seen.add(ts.palettePcOffset);
      try {
        const palette = decompressTilesetPalette(rom, ts.palettePcOffset);
        cached.push({ info: ts, palette });
      } catch { /* skip bad tilesets */ }
    }
    setCachedTilesets(cached);
  }, []);

  useEffect(() => {
    loadRomFromStorage().then(saved => {
      if (saved) {
        romRef.current = saved;
        setRomLoaded(true);
        cacheTilesets(saved);
      }
    });
  }, [cacheTilesets]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const rom = new Uint8Array(reader.result as ArrayBuffer);
        const err = validateRom(rom);
        if (err) { setError(err); return; }
        setError(null);
        romRef.current = rom;
        setRomLoaded(true);
        setCategoryEffects(emptyCategoryEffects());
        setColorOverrides(new Map());
        setRomName(file.name);
        cacheTilesets(rom);
        saveRomToStorage(rom);
      };
      reader.readAsArrayBuffer(file);
    }, [cacheTilesets],
  );

  const handleToggleEffect = useCallback((effect: PaletteEffect) => {
    startTransition(() => {
      setCategoryEffects(prev => {
        const next = {
          samus: new Set(prev.samus),
          environment: new Set(prev.environment),
          beams: new Set(prev.beams),
          bosses: new Set(prev.bosses),
        };
        if (selectedCategory === "all") {
          // In "Everything" mode, toggle for all categories
          const allHave = next.samus.has(effect.id) && next.environment.has(effect.id) && next.beams.has(effect.id) && next.bosses.has(effect.id);
          for (const cat of ["samus", "environment", "beams", "bosses"] as const) {
            if (allHave) next[cat].delete(effect.id);
            else next[cat].add(effect.id);
          }
        } else {
          const cat = selectedCategory as PaletteCategory;
          if (next[cat].has(effect.id)) next[cat].delete(effect.id);
          else next[cat].add(effect.id);
        }
        return next;
      });
    });
  }, [selectedCategory]);

  const handleReset = useCallback(() => {
    setCategoryEffects(emptyCategoryEffects());
    setColorOverrides(new Map());
  }, []);

  const handleColorOverride = useCallback((key: string, bgr555: number) => {
    setColorOverrides(prev => {
      const next = new Map(prev);
      next.set(key, bgr555);
      return next;
    });
  }, []);

  const handleDownload = useCallback(() => {
    if (!romRef.current) return;
    let patched = new Uint8Array(romRef.current);
    const hdr = headerOffset(patched);

    // Apply per-category effects to uncompressed regions
    for (const region of REGIONS) {
      const offset = region.offset + hdr;
      if (offset + region.colorCount * 2 > patched.length) continue;
      const effects = categoryEffects[region.category];
      const effectFns = [...effects]
        .map(id => EFFECTS.find(e => e.id === id))
        .filter((e): e is PaletteEffect => !!e)
        .map(e => e.apply);
      for (const fn of effectFns) {
        fn(patched, offset, region.colorCount);
      }
    }

    // Apply color overrides for uncompressed regions
    for (const [key, bgr555] of colorOverrides) {
      if (key.startsWith("tileset:")) continue; // handled below
      const [regionId, idxStr] = key.split(":");
      const region = REGIONS.find(r => r.id === regionId);
      if (!region) continue;
      const offset = region.offset + hdr + parseInt(idxStr) * 2;
      patched[offset] = bgr555 & 0xff;
      patched[offset + 1] = (bgr555 >> 8) & 0xff;
    }

    // Apply environment effects to tileset palettes
    const envEffectFns = [...categoryEffects.environment]
      .map(id => EFFECTS.find(e => e.id === id))
      .filter((e): e is PaletteEffect => !!e)
      .map(e => e.apply);
    patched = patchTilesetPalettes(patched, envEffectFns, colorOverrides);

    downloadRom(patched, romName.replace(/\.\w+$/, "") + "_colors.smc");
  }, [categoryEffects, colorOverrides, romName]);

  const handleClearRom = useCallback(() => {
    clearRomFromStorage();
    romRef.current = null;
    setRomLoaded(false);
    setCategoryEffects(emptyCategoryEffects());
    setColorOverrides(new Map());
    setCachedTilesets([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const visibleRegions = useMemo(() =>
    REGIONS.filter(r => selectedCategory === "all" || r.category === selectedCategory),
    [selectedCategory],
  );

  const showTilesets = selectedCategory === "all" || selectedCategory === "environment";

  return (
    <div className="app">
      <header className="app-header">
        <h1>Super Metroid Colors</h1>
        <p className="subtitle">ROM Palette Patcher &mdash; runs entirely in your browser</p>
      </header>

      {!romLoaded ? (
        <section className="upload-section">
          <div className="upload-box" onClick={() => fileInputRef.current?.click()}>
            <div className="upload-icon">&#128190;</div>
            <h2>Upload your Super Metroid ROM</h2>
            <p>Click or drag a .smc / .sfc file here. Stored locally, never uploaded.</p>
            <input ref={fileInputRef} type="file" accept=".smc,.sfc,.bin" onChange={handleFileUpload} hidden />
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      ) : (
        <>
          <section className="rom-info">
            <span>ROM: <strong>{romName}</strong> ({((romRef.current?.length ?? 0) / 1024).toFixed(0)} KB)</span>
            <div className="rom-actions">
              <button onClick={handleReset} className="btn btn-secondary"
                disabled={totalActiveCount === 0 && colorOverrides.size === 0}>
                Reset
              </button>
              <button onClick={handleDownload} className="btn btn-primary"
                disabled={totalActiveCount === 0 && colorOverrides.size === 0}>
                Download Patched ROM
              </button>
              <button onClick={handleClearRom} className="btn btn-danger">Unload ROM</button>
            </div>
          </section>

          <section className="target-section">
            <h3>Palette Preview</h3>
            <div className="pills">
              {CATEGORIES.map(cat => (
                <button key={cat.id}
                  className={`pill ${selectedCategory === cat.id ? "active" : ""}`}
                  onClick={() => startTransition(() => setSelectedCategory(cat.id))}>
                  {cat.name}
                </button>
              ))}
            </div>
          </section>

          <section className="effects-section">
            <h3>
              Effects
              {totalActiveCount > 0 && <span className="effect-count"> ({totalActiveCount} active)</span>}
              {selectedCategory !== "all" && (
                <span className="effect-scope"> &mdash; applying to {selectedCategory}</span>
              )}
            </h3>
            {(["classic", "tint", "wild", "aesthetic"] as const).map(category => {
              const effects = EFFECTS.filter(e => e.category === category);
              return (
                <div key={category} className="effect-group">
                  <h4>{category.charAt(0).toUpperCase() + category.slice(1)}</h4>
                  <div className="effects-grid">
                    {effects.map(effect => {
                      const state = effectButtonStates.get(effect.id) ?? "inactive";
                      return (
                        <button key={effect.id}
                          className={`effect-btn ${state}`}
                          onClick={() => handleToggleEffect(effect)}>
                          {effect.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="preview-section">
            <div className="preview-grid">
              {visibleRegions.map(region => (
                <PalettePreview key={region.id} region={region}
                  rom={romRef.current!}
                  activeEffects={activeEffectsForCategory(region.category)}
                  colorOverrides={colorOverrides}
                  onColorOverride={handleColorOverride} />
              ))}
              {showTilesets && cachedTilesets.map(ct => (
                <TilesetPreview key={`ts_${ct.info.index}`} cached={ct}
                  activeEffects={activeEffectsForCategory("environment")}
                  colorOverrides={colorOverrides}
                  onColorOverride={handleColorOverride} />
              ))}
            </div>
          </section>
        </>
      )}

    </div>
  );
}

// ─── Swatch Component ──────────────────────────────────────────────────────

function bgr555ToHex(bgr555: number): string {
  const { r, g, b } = bgr555ToRgb(bgr555);
  return `#${rgb5to8(r).toString(16).padStart(2, "0")}${rgb5to8(g).toString(16).padStart(2, "0")}${rgb5to8(b).toString(16).padStart(2, "0")}`;
}

function hexToBgr555(hex: string): number {
  const rr = parseInt(hex.slice(1, 3), 16);
  const gg = parseInt(hex.slice(3, 5), 16);
  const bb = parseInt(hex.slice(5, 7), 16);
  return rgbToBgr555(Math.round(rr * 31 / 255), Math.round(gg * 31 / 255), Math.round(bb * 31 / 255));
}

function Swatch({ color, overrideKey, colorOverrides, onColorOverride }: {
  color: number;
  overrideKey: string;
  colorOverrides: ColorOverrides;
  onColorOverride: (key: string, bgr555: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const effectiveColor = colorOverrides.get(overrideKey) ?? color;
  const { r, g, b } = bgr555ToRgb(effectiveColor);
  const isOverridden = colorOverrides.has(overrideKey);

  const handleClick = () => {
    if (inputRef.current) {
      inputRef.current.value = bgr555ToHex(effectiveColor);
      inputRef.current.click();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onColorOverride(overrideKey, hexToBgr555(e.target.value));
  };

  return (
    <div
      className={`swatch clickable ${isOverridden ? "overridden" : ""}`}
      style={{ backgroundColor: effectiveColor === 0 && !isOverridden ? "#111" : rgbToCss(r, g, b) }}
      onClick={handleClick}
      title="Click to edit color"
    >
      <input ref={inputRef} type="color" className="swatch-picker"
        onChange={handleChange} tabIndex={-1} />
    </div>
  );
}

// ─── Palette Previews ──────────────────────────────────────────────────────

const PalettePreview = memo(function PalettePreview({ region, rom, activeEffects, colorOverrides, onColorOverride }: {
  region: PaletteRegion; rom: Uint8Array; activeEffects: Set<string>;
  colorOverrides: ColorOverrides; onColorOverride: (key: string, bgr555: number) => void;
}) {
  const hdr = headerOffset(rom);
  const offset = region.offset + hdr;
  const previewCount = Math.min(region.colorCount, 16);
  if (offset + previewCount * 2 > rom.length) return null;

  const origColors = readPalette(rom, offset, previewCount);

  let previewColors = origColors;
  if (activeEffects.size > 0) {
    const buf = new Uint8Array(previewCount * 2);
    writePalette(buf, 0, origColors);
    for (const effectId of activeEffects) {
      const effect = EFFECTS.find(e => e.id === effectId);
      if (effect) effect.apply(buf, 0, previewCount);
    }
    previewColors = readPalette(buf, 0, previewCount);
  }

  return (
    <div className="palette-card">
      <h4>{region.name}</h4>
      <div className="swatches">
        {previewColors.map((c, i) => (
          <Swatch key={i} color={c}
            overrideKey={`${region.id}:${i}`}
            colorOverrides={colorOverrides}
            onColorOverride={onColorOverride} />
        ))}
      </div>
    </div>
  );
});

const TilesetPreview = memo(function TilesetPreview({ cached, activeEffects, colorOverrides, onColorOverride }: {
  cached: CachedTileset; activeEffects: Set<string>;
  colorOverrides: ColorOverrides; onColorOverride: (key: string, bgr555: number) => void;
}) {
  const totalColors = 128; // 8 sub-palettes x 16 colors
  const origColors = readPalette(cached.palette, 0, totalColors);

  let previewColors = origColors;
  if (activeEffects.size > 0) {
    const buf = new Uint8Array(totalColors * 2);
    writePalette(buf, 0, origColors);
    for (const effectId of activeEffects) {
      const effect = EFFECTS.find(e => e.id === effectId);
      if (effect) effect.apply(buf, 0, totalColors);
    }
    previewColors = readPalette(buf, 0, totalColors);
  }

  const rows: number[][] = [];
  for (let r = 0; r < 8; r++) {
    rows.push(Array.from(previewColors.slice(r * 16, r * 16 + 16)));
  }

  return (
    <div className="palette-card">
      <h4>{cached.info.name}</h4>
      {rows.map((row, ri) => (
        <div key={ri} className="swatches">
          {row.map((c, i) => (
            <Swatch key={i} color={c}
              overrideKey={`tileset:${cached.info.palettePcOffset}:${ri * 16 + i}`}
              colorOverrides={colorOverrides}
              onColorOverride={onColorOverride} />
          ))}
        </div>
      ))}
    </div>
  );
});

export default App;
