import { useState, useEffect, useCallback, useRef, useMemo, memo, startTransition } from "react";
import {
  readPalette,
  bgr555ToRgb,
  rgbToCss,
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

interface CachedTileset {
  info: TilesetInfo;
  palette: Uint8Array; // pre-decompressed 256 bytes
}

function App() {
  const romRef = useRef<Uint8Array | null>(null);
  const [romLoaded, setRomLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");
  const [activeEffects, setActiveEffects] = useState<Set<string>>(new Set());
  const [romName, setRomName] = useState("super_metroid.smc");
  const [cachedTilesets, setCachedTilesets] = useState<CachedTileset[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setActiveEffects(new Set());
        setRomName(file.name);
        cacheTilesets(rom);
        saveRomToStorage(rom);
      };
      reader.readAsArrayBuffer(file);
    }, [cacheTilesets],
  );

  const handleToggleEffect = useCallback((effect: PaletteEffect) => {
    startTransition(() => {
      setActiveEffects(prev => {
        const next = new Set(prev);
        if (next.has(effect.id)) {
          next.delete(effect.id);
        } else {
          next.add(effect.id);
        }
        return next;
      });
    });
  }, []);

  const handleReset = useCallback(() => {
    setActiveEffects(new Set());
  }, []);

  const handleDownload = useCallback(() => {
    if (!romRef.current) return;
    let patched = new Uint8Array(romRef.current);
    const hdr = headerOffset(patched);

    const effectFns = [...activeEffects]
      .map(id => EFFECTS.find(e => e.id === id))
      .filter((e): e is PaletteEffect => !!e)
      .map(e => e.apply);

    for (const effectFn of effectFns) {
      for (const region of REGIONS) {
        const offset = region.offset + hdr;
        if (offset + region.colorCount * 2 <= patched.length) {
          effectFn(patched, offset, region.colorCount);
        }
      }
    }

    patched = patchTilesetPalettes(patched, effectFns);
    downloadRom(patched, romName.replace(/\.\w+$/, "") + "_colors.smc");
  }, [activeEffects, romName]);

  const handleClearRom = useCallback(() => {
    clearRomFromStorage();
    romRef.current = null;
    setRomLoaded(false);
    setActiveEffects(new Set());
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
              <button onClick={handleReset} className="btn btn-secondary" disabled={activeEffects.size === 0}>
                Reset
              </button>
              <button onClick={handleDownload} className="btn btn-primary" disabled={activeEffects.size === 0}>
                Download Patched ROM
              </button>
              <button onClick={handleClearRom} className="btn btn-danger">Unload ROM</button>
            </div>
          </section>

          <section className="effects-section">
            <h3>Effects {activeEffects.size > 0 && <span className="effect-count">({activeEffects.size} active)</span>}</h3>
            {(["classic", "tint", "wild", "aesthetic"] as const).map(category => {
              const effects = EFFECTS.filter(e => e.category === category);
              return (
                <div key={category} className="effect-group">
                  <h4>{category.charAt(0).toUpperCase() + category.slice(1)}</h4>
                  <div className="effects-grid">
                    {effects.map(effect => (
                      <button key={effect.id}
                        className={`effect-btn ${activeEffects.has(effect.id) ? "active" : ""}`}
                        onClick={() => handleToggleEffect(effect)}>
                        {effect.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
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

          <section className="preview-section">
            <div className="preview-grid">
              {visibleRegions.map(region => (
                <PalettePreview key={region.id} region={region}
                  rom={romRef.current!} activeEffects={activeEffects} />
              ))}
              {showTilesets && cachedTilesets.map(ct => (
                <TilesetPreview key={`ts_${ct.info.index}`} cached={ct}
                  activeEffects={activeEffects} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const PalettePreview = memo(function PalettePreview({ region, rom, activeEffects }: {
  region: PaletteRegion; rom: Uint8Array; activeEffects: Set<string>;
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
        {previewColors.map((c, i) => {
          const { r, g, b } = bgr555ToRgb(c);
          return <div key={i} className="swatch"
            style={{ backgroundColor: c === 0 ? "#111" : rgbToCss(r, g, b) }} />;
        })}
      </div>
    </div>
  );
});

const TilesetPreview = memo(function TilesetPreview({ cached, activeEffects }: {
  cached: CachedTileset; activeEffects: Set<string>;
}) {
  const totalColors = 128; // 8 sub-palettes × 16 colors
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

  // Render as 8 rows of 16 colors
  const rows: number[][] = [];
  for (let r = 0; r < 8; r++) {
    rows.push(Array.from(previewColors.slice(r * 16, r * 16 + 16)));
  }

  return (
    <div className="palette-card">
      <h4>{cached.info.name}</h4>
      {rows.map((row, ri) => (
        <div key={ri} className="swatches">
          {row.map((c, i) => {
            const { r, g, b } = bgr555ToRgb(c);
            return <div key={i} className="swatch"
              style={{ backgroundColor: c === 0 ? "#111" : rgbToCss(r, g, b) }} />;
          })}
        </div>
      ))}
    </div>
  );
});

export default App;
