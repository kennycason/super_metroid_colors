/**
 * ROM Patcher - handles save/load and download.
 */

import { headerOffset } from "./palette";

const DB_NAME = "sm_colors";
const DB_STORE = "rom";
const ROM_KEY = "sm_colors_rom";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRomToStorage(rom: Uint8Array) {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(rom, ROM_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    console.warn("Failed to save ROM to IndexedDB");
  }
}

export async function loadRomFromStorage(): Promise<Uint8Array | null> {
  // Clean up old localStorage-based ROM data (base64-encoded, blocks main thread on load)
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.includes("rom") || key.includes("sm_colors")) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* ignore */ }

  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(ROM_KEY);
    const result = await new Promise<Uint8Array | null>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function clearRomFromStorage() {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(ROM_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

/**
 * Download a ROM as a file
 */
export function downloadRom(rom: Uint8Array, filename: string) {
  const blob = new Blob([rom.slice().buffer as ArrayBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Validate that a file looks like a Super Metroid ROM
 */
export function validateRom(rom: Uint8Array): string | null {
  if (rom.length < 0x100000) {
    return "File too small - expected at least 1MB for a Super Metroid ROM";
  }
  if (rom.length > 0x800000) {
    return "File too large - expected at most 8MB";
  }

  // Check for SM internal header name at 0x7FC0 (unheadered) or 0x81C0 (headered)
  const hdr = headerOffset(rom);
  const nameOffset = hdr + 0x7fc0;
  if (nameOffset + 21 <= rom.length) {
    const name = Array.from(rom.slice(nameOffset, nameOffset + 21))
      .map(b => String.fromCharCode(b))
      .join("");
    if (!name.includes("SUPER METROID") && !name.includes("Super Metroid")) {
      // Not a strict failure - could be a hack/translation
      console.warn("ROM internal name doesn't match Super Metroid:", name);
    }
  }

  return null; // valid
}
