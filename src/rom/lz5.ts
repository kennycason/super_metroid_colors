/**
 * LZ5 decompressor for Super Metroid compressed data.
 * Ported from aremath/sm_rando decompress.py via super_metroid_dev RomParser.kt
 */

export function decompressLZ5(rom: Uint8Array, startPc: number): Uint8Array {
  const dst = new Uint8Array(0x20000); // 128KB max
  let dstPos = 0;
  let pos = startPc;

  while (pos < rom.length) {
    const nextCmd = rom[pos];

    if (nextCmd === 0xff) break;

    let cmdCode: number;
    let length: number;
    const topBits = (nextCmd >> 5) & 7;

    if (topBits === 7) {
      // Extended: 2-byte header
      cmdCode = (nextCmd >> 2) & 7;
      length = (((nextCmd & 0x03) << 8) | rom[pos + 1]) + 1;
      pos += 2;
    } else {
      cmdCode = topBits;
      length = (nextCmd & 0x1f) + 1;
      pos += 1;
    }

    switch (cmdCode) {
      case 0: // Direct copy
        for (let i = 0; i < length && pos < rom.length; i++) {
          dst[dstPos++] = rom[pos++];
        }
        break;
      case 1: { // Byte fill
        const fill = rom[pos++];
        for (let i = 0; i < length; i++) dst[dstPos++] = fill;
        break;
      }
      case 2: { // Word fill
        const b1 = rom[pos++];
        const b2 = rom[pos++];
        for (let i = 0; i < length; i++) dst[dstPos++] = i % 2 === 0 ? b1 : b2;
        break;
      }
      case 3: { // Increasing fill
        let b = rom[pos++];
        for (let i = 0; i < length; i++) dst[dstPos++] = (b + i) & 0xff;
        break;
      }
      case 4: { // Repeat (absolute copy from output, with wrap-around)
        const addr4 = rom[pos] | (rom[pos + 1] << 8);
        pos += 2;
        // Copy from output buffer. If source extends past dstPos,
        // wrap around and repeat from what was just written.
        const startDst4 = dstPos;
        for (let i = 0; i < length; i++) {
          const srcIdx = addr4 + i;
          if (srcIdx < startDst4) {
            dst[dstPos++] = dst[srcIdx];
          } else {
            // Wrap: copy from the newly written portion
            dst[dstPos++] = dst[startDst4 + ((srcIdx - startDst4) % (dstPos - startDst4))];
          }
        }
        break;
      }
      case 5: { // XOR repeat (same as cmd 4 but XOR 0xFF)
        const addr5 = rom[pos] | (rom[pos + 1] << 8);
        pos += 2;
        const startDst5 = dstPos;
        for (let i = 0; i < length; i++) {
          const srcIdx = addr5 + i;
          if (srcIdx < startDst5) {
            dst[dstPos++] = dst[srcIdx] ^ 0xff;
          } else {
            dst[dstPos++] = dst[startDst5 + ((srcIdx - startDst5) % (dstPos - startDst5))] ^ 0xff;
          }
        }
        break;
      }
      case 6: { // Negative repeat (relative offset, 1 byte)
        const offset6 = rom[pos++];
        const srcAddr6 = dstPos - offset6;
        for (let i = 0; i < length; i++) {
          dst[dstPos] = dst[srcAddr6 + i];
          dstPos++;
        }
        break;
      }
      case 7: { // Negative XOR repeat
        const offset7 = rom[pos++];
        const srcAddr7 = dstPos - offset7;
        for (let i = 0; i < length; i++) {
          dst[dstPos] = dst[srcAddr7 + i] ^ 0xff;
          dstPos++;
        }
        break;
      }
    }
  }

  return dst.slice(0, dstPos);
}

/**
 * LZ5 compressor for Super Metroid.
 * Ported from super_metroid_dev LZ5Compressor.kt (known to produce
 * output compatible with the SNES decompression engine).
 *
 * Supports: raw copy (cmd 0), byte fill (cmd 1), word fill (cmd 2),
 * increasing fill (cmd 3), absolute dictionary copy (cmd 4),
 * and relative dictionary copy (cmd 6).
 */
export function compressLZ5(data: Uint8Array): Uint8Array {
  const MAX_LEN = 1024;
  const HASH_SIZE = 0x4000;
  const HASH_MASK = HASH_SIZE - 1;
  const MAX_CHAIN = 512;

  const out: number[] = [];
  const rawBuf: number[] = [];

  const hashHead = new Int32Array(HASH_SIZE).fill(-1);
  const hashPrev = new Int32Array(data.length).fill(-1);

  function hashAt(p: number): number {
    if (p + 2 >= data.length) return 0;
    return ((data[p] << 10) ^ (data[p + 1] << 5) ^ data[p + 2]) & HASH_MASK;
  }

  function updateHash(p: number) {
    if (p >= data.length) return;
    const h = hashAt(p);
    hashPrev[p] = hashHead[h];
    hashHead[h] = p;
  }

  function emitCmd(cmd: number, length: number) {
    if (length <= 32) {
      out.push((cmd << 5) | (length - 1));
    } else {
      const len = length - 1;
      out.push(0xe0 | ((cmd & 7) << 2) | ((len >> 8) & 0x03));
      out.push(len & 0xff);
    }
  }

  function flushRaw() {
    let i = 0;
    while (i < rawBuf.length) {
      const chunk = Math.min(rawBuf.length - i, MAX_LEN);
      emitCmd(0, chunk);
      for (let j = 0; j < chunk; j++) out.push(rawBuf[i + j]);
      i += chunk;
    }
    rawBuf.length = 0;
  }

  function findMatch(curPos: number): { len: number; addr: number; relative: boolean } {
    let bestLen = 0, bestAddr = 0, useRelative = false;
    const maxMatch = Math.min(data.length - curPos, MAX_LEN);
    if (maxMatch < 3) return { len: 0, addr: 0, relative: false };

    const h = hashAt(curPos);
    let candidate = hashHead[h];
    let chainLen = 0;

    while (candidate >= 0 && chainLen < MAX_CHAIN) {
      let mLen = 0;
      while (mLen < maxMatch && data[candidate + mLen] === data[curPos + mLen]) mLen++;
      const relOff = curPos - candidate;
      const isRel = relOff >= 1 && relOff <= 0xff;
      if (mLen > bestLen || (mLen === bestLen && mLen >= 3 && isRel && !useRelative)) {
        bestLen = mLen;
        if (isRel) { bestAddr = relOff; useRelative = true; }
        else { bestAddr = candidate; useRelative = false; }
        if (mLen >= 256) break;
      }
      candidate = hashPrev[candidate];
      chainLen++;
    }
    return { len: bestLen, addr: bestAddr, relative: useRelative };
  }

  function countByteFill(pos: number): number {
    if (pos >= data.length) return 0;
    const b = data[pos]; let c = 1;
    while (pos + c < data.length && c < MAX_LEN && data[pos + c] === b) c++;
    return c;
  }

  function countWordFill(pos: number): number {
    if (pos + 1 >= data.length) return 0;
    const a = data[pos], b = data[pos + 1]; let c = 2;
    while (pos + c < data.length && c < MAX_LEN) {
      if (data[pos + c] !== (c % 2 === 0 ? a : b)) break;
      c++;
    }
    return c;
  }

  function countIncrFill(pos: number): number {
    if (pos >= data.length) return 0;
    let expected = (data[pos] + 1) & 0xff;
    let c = 1;
    while (pos + c < data.length && c < MAX_LEN) {
      if (data[pos + c] !== (expected & 0xff)) break;
      expected++;
      c++;
    }
    return c;
  }

  let pos = 0;
  while (pos < data.length) {
    const { len: dictLen, addr: dictAddr, relative: dictRelative } = findMatch(pos);
    const byteLen = countByteFill(pos);
    const wordLen = countWordFill(pos);
    const incrLen = countIncrFill(pos);

    const dictHeaderCost = dictRelative
      ? (dictLen <= 32 ? 2 : 3)
      : (dictLen <= 32 ? 3 : 4);
    const dictSaving = dictLen >= 3 ? dictLen - dictHeaderCost : 0;
    const byteSaving = byteLen >= 3 ? byteLen - (byteLen <= 32 ? 2 : 3) : 0;
    const wordSaving = wordLen >= 4 ? wordLen - (wordLen <= 32 ? 3 : 4) : 0;
    const incrSaving = incrLen >= 3 ? incrLen - (incrLen <= 32 ? 2 : 3) : 0;

    if (dictSaving > 0 && dictSaving >= byteSaving && dictSaving >= wordSaving && dictSaving >= incrSaving) {
      flushRaw();
      const len = Math.min(dictLen, MAX_LEN);
      if (dictRelative) {
        emitCmd(6, len);
        out.push(dictAddr & 0xff);
      } else {
        emitCmd(4, len);
        out.push(dictAddr & 0xff);
        out.push((dictAddr >> 8) & 0xff);
      }
      for (let i = 0; i < len; i++) updateHash(pos + i);
      pos += len;
    } else if (byteSaving > 0 && byteSaving >= wordSaving && byteSaving >= incrSaving) {
      flushRaw();
      const len = Math.min(byteLen, MAX_LEN);
      emitCmd(1, len);
      out.push(data[pos]);
      for (let i = 0; i < len; i++) updateHash(pos + i);
      pos += len;
    } else if (incrSaving > 0 && incrSaving >= wordSaving) {
      flushRaw();
      const len = Math.min(incrLen, MAX_LEN);
      emitCmd(3, len);
      out.push(data[pos]);
      for (let i = 0; i < len; i++) updateHash(pos + i);
      pos += len;
    } else if (wordSaving > 0) {
      flushRaw();
      const len = Math.min(wordLen, MAX_LEN);
      emitCmd(2, len);
      out.push(data[pos]);
      out.push(data[pos + 1]);
      for (let i = 0; i < len; i++) updateHash(pos + i);
      pos += len;
    } else {
      updateHash(pos);
      rawBuf.push(data[pos]);
      pos++;
    }
  }

  flushRaw();
  out.push(0xff);
  return new Uint8Array(out);
}

/**
 * Convert a SNES LoROM address to a PC file offset.
 */
export function snesToPc(snesAddr: number): number {
  const bank = (snesAddr >> 16) & 0xff;
  const offset = snesAddr & 0xffff;
  return ((bank & 0x7f) * 0x8000) + (offset - 0x8000);
}
