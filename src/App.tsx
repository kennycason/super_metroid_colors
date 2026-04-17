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

/**
 * Per-region effect overrides.
 * Key = region ID or "tileset:pcOffset", value = Set of effect IDs.
 * When present, these override the category-level effects for that specific region.
 */
type RegionEffectOverrides = Map<string, Set<string>>;

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
  const [regionEffectOverrides, setRegionEffectOverrides] = useState<RegionEffectOverrides>(new Map());
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null); // region key for per-region override
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

  const hasAnyChanges = totalActiveCount > 0 || colorOverrides.size > 0 || regionEffectOverrides.size > 0;

  /** Get the effective effects for a region: region override > category-level */
  const getEffectsForRegion = (regionKey: string, category: PaletteCategory): Set<string> => {
    return regionEffectOverrides.get(regionKey) ?? categoryEffects[category];
  };

  /** Compute which effect buttons should appear active in the current view */
  const effectButtonStates = useMemo(() => {
    const states = new Map<string, "active" | "partial" | "inactive">();

    // If a specific region is selected, show that region's effects
    if (selectedRegion) {
      const overrides = regionEffectOverrides.get(selectedRegion);
      for (const effect of EFFECTS) {
        states.set(effect.id, overrides?.has(effect.id) ? "active" : "inactive");
      }
      return states;
    }

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
  }, [selectedCategory, categoryEffects, selectedRegion, regionEffectOverrides]);

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
        romRef.current = saved.rom;
        setRomLoaded(true);
        setRomName(saved.name);
        cacheTilesets(saved.rom);
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
        setRegionEffectOverrides(new Map());
        setSelectedRegion(null);
        setRomName(file.name);
        cacheTilesets(rom);
        saveRomToStorage(rom, file.name);
      };
      reader.readAsArrayBuffer(file);
    }, [cacheTilesets],
  );

  const handleToggleEffect = useCallback((effect: PaletteEffect) => {
    startTransition(() => {
      // If a region is selected, toggle for that region's override
      if (selectedRegion) {
        setRegionEffectOverrides(prev => {
          const next = new Map(prev);
          const existing = next.get(selectedRegion);
          const set = existing ? new Set(existing) : new Set<string>();
          if (set.has(effect.id)) set.delete(effect.id);
          else set.add(effect.id);
          if (set.size === 0) next.delete(selectedRegion);
          else next.set(selectedRegion, set);
          return next;
        });
        return;
      }

      setCategoryEffects(prev => {
        const next = {
          samus: new Set(prev.samus),
          environment: new Set(prev.environment),
          beams: new Set(prev.beams),
          bosses: new Set(prev.bosses),
        };
        if (selectedCategory === "all") {
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
  }, [selectedCategory, selectedRegion]);

  const handleReset = useCallback(() => {
    setCategoryEffects(emptyCategoryEffects());
    setColorOverrides(new Map());
    setRegionEffectOverrides(new Map());
    setSelectedRegion(null);
  }, []);

  const handleColorOverride = useCallback((key: string, bgr555: number) => {
    setColorOverrides(prev => {
      const next = new Map(prev);
      next.set(key, bgr555);
      return next;
    });
  }, []);

  const handleSelectRegion = useCallback((regionKey: string | null) => {
    setSelectedRegion(prev => prev === regionKey ? null : regionKey);
  }, []);

  const handleDownload = useCallback(() => {
    if (!romRef.current) return;
    let patched = new Uint8Array(romRef.current);
    const hdr = headerOffset(patched);

    // Apply per-category effects to uncompressed regions
    for (const region of REGIONS) {
      const offset = region.offset + hdr;
      if (offset + region.colorCount * 2 > patched.length) continue;

      // Use region override if present, otherwise category-level
      const effectIds = regionEffectOverrides.get(region.id) ?? categoryEffects[region.category];
      const effectFns = [...effectIds]
        .map(id => EFFECTS.find(e => e.id === id))
        .filter((e): e is PaletteEffect => !!e)
        .map(e => e.apply);
      for (const fn of effectFns) {
        fn(patched, offset, region.colorCount);
      }
    }

    // Apply color overrides for uncompressed regions
    for (const [key, bgr555] of colorOverrides) {
      if (key.startsWith("tileset:")) continue;
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
    patched = patchTilesetPalettes(patched, envEffectFns, colorOverrides, regionEffectOverrides);

    downloadRom(patched, romName.replace(/\.\w+$/, "") + " Colors.smc");
  }, [categoryEffects, colorOverrides, regionEffectOverrides, romName]);

  const handleClearRom = useCallback(() => {
    clearRomFromStorage();
    romRef.current = null;
    setRomLoaded(false);
    setCategoryEffects(emptyCategoryEffects());
    setColorOverrides(new Map());
    setRegionEffectOverrides(new Map());
    setSelectedRegion(null);
    setCachedTilesets([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const visibleRegions = useMemo(() =>
    REGIONS.filter(r => selectedCategory === "all" || r.category === selectedCategory),
    [selectedCategory],
  );

  /** Pre-extract palette colors from ROM so we never pass the 3MB ROM as a prop */
  const regionColors = useMemo(() => {
    const rom = romRef.current;
    if (!rom) return new Map<string, number[]>();
    const hdr = headerOffset(rom);
    const map = new Map<string, number[]>();
    for (const region of REGIONS) {
      const offset = region.offset + hdr;
      const count = Math.min(region.colorCount, 16);
      if (offset + count * 2 <= rom.length) {
        map.set(region.id, readPalette(rom, offset, count));
      }
    }
    return map;
  }, [romLoaded]);

  const showTilesets = selectedCategory === "all" || selectedCategory === "environment";

  // Determine scope label for the effects header
  const scopeLabel = selectedRegion
    ? (() => {
        // Find a display name for the selected region
        const region = REGIONS.find(r => r.id === selectedRegion);
        if (region) return region.name;
        const ts = cachedTilesets.find(ct => `tileset:${ct.info.palettePcOffset}` === selectedRegion);
        if (ts) return ts.info.name;
        return selectedRegion;
      })()
    : selectedCategory !== "all" ? selectedCategory : null;

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
              <button onClick={handleReset} className="btn btn-secondary" disabled={!hasAnyChanges}>
                Reset
              </button>
              <button onClick={handleDownload} className="btn btn-primary" disabled={!hasAnyChanges}>
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
                  className={`pill ${selectedCategory === cat.id && !selectedRegion ? "active" : ""}`}
                  onClick={() => { startTransition(() => setSelectedCategory(cat.id)); setSelectedRegion(null); }}>
                  {cat.name}
                </button>
              ))}
            </div>
          </section>

          <section className="effects-section">
            <h3>
              Effects
              {totalActiveCount > 0 && <span className="effect-count"> ({totalActiveCount} active)</span>}
              {scopeLabel && (
                <span className="effect-scope"> &mdash; {selectedRegion ? `${scopeLabel} only` : `applying to ${scopeLabel}`}</span>
              )}
              {selectedRegion && (
                <button className="btn-clear-scope" onClick={() => setSelectedRegion(null)}>clear</button>
              )}
            </h3>
            <div className="effects-grid">
              {EFFECTS.map(effect => {
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
          </section>

          <section className="preview-section">
            <div className="preview-grid">
              {visibleRegions.map(region => {
                const colors = regionColors.get(region.id);
                if (!colors) return null;
                return (
                  <PalettePreview key={region.id} region={region}
                    origColors={colors}
                    activeEffects={getEffectsForRegion(region.id, region.category)}
                    colorOverrides={colorOverrides}
                    onColorOverride={handleColorOverride}
                    isSelected={selectedRegion === region.id}
                    hasOverride={regionEffectOverrides.has(region.id)}
                    regionKey={region.id}
                    onSelect={handleSelectRegion} />
                );
              })}
              {showTilesets && cachedTilesets.map(ct => {
                const tsKey = `tileset:${ct.info.palettePcOffset}`;
                return (
                  <TilesetPreview key={`ts_${ct.info.index}`} cached={ct}
                    activeEffects={getEffectsForRegion(tsKey, "environment")}
                    colorOverrides={colorOverrides}
                    onColorOverride={handleColorOverride}
                    isSelected={selectedRegion === tsKey}
                    hasOverride={regionEffectOverrides.has(tsKey)}
                    regionKey={tsKey}
                    onSelect={handleSelectRegion} />
                );
              })}
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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger card select
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

const PalettePreview = memo(function PalettePreview({ region, origColors, activeEffects, colorOverrides, onColorOverride, isSelected, hasOverride, regionKey, onSelect }: {
  region: PaletteRegion; origColors: number[]; activeEffects: Set<string>;
  colorOverrides: ColorOverrides; onColorOverride: (key: string, bgr555: number) => void;
  isSelected: boolean; hasOverride: boolean; regionKey: string; onSelect: (key: string | null) => void;
}) {
  const previewCount = origColors.length;

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

  const handleCardClick = useCallback(() => onSelect(isSelected ? null : regionKey), [onSelect, isSelected, regionKey]);

  return (
    <div className={`palette-card ${isSelected ? "selected" : ""} ${hasOverride ? "has-override" : ""}`}
      onClick={handleCardClick}>
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

const TilesetPreview = memo(function TilesetPreview({ cached, activeEffects, colorOverrides, onColorOverride, isSelected, hasOverride, regionKey, onSelect }: {
  cached: CachedTileset; activeEffects: Set<string>;
  colorOverrides: ColorOverrides; onColorOverride: (key: string, bgr555: number) => void;
  isSelected: boolean; hasOverride: boolean; regionKey: string; onSelect: (key: string | null) => void;
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

  const handleCardClick = useCallback(() => onSelect(isSelected ? null : regionKey), [onSelect, isSelected, regionKey]);

  return (
    <div className={`palette-card ${isSelected ? "selected" : ""} ${hasOverride ? "has-override" : ""}`}
      onClick={handleCardClick}>
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
