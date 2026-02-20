/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * (c) 2012 Michael Tinglof, Joe Balaz, Les Piech (Mercuri.ca)
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 *
 */

import * as Log from '../util/logging.ts';
import Inflator from "../inflator.ts";
import type { DecoderSock, DecoderDisplay } from '../types.ts';

export default class TightDecoder {
    protected _ctl: number | null;
    protected _filter: number | null;
    protected _numColors: number;
    protected _palette: Uint8Array;
    protected _len: number;
    protected _zlibs: Inflator[];
    private _scratchBuffer: Uint8Array | null;

    constructor() {
        this._ctl = null;
        this._filter = null;
        this._numColors = 0;
        this._palette = new Uint8Array(1024);  // 256 * 4 (max palette size * max bytes-per-pixel)
        this._len = 0;
        this._scratchBuffer = null;

        this._zlibs = [];
        for (let i = 0; i < 4; i++) {
            this._zlibs[i] = new Inflator();
        }
    }

    decodeRect(x: number, y: number, width: number, height: number,
               sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        if (this._ctl === null) {
            if (sock.rQwait("TIGHT compression-control", 1)) {
                return false;
            }

            this._ctl = sock.rQshift8();

            // Reset streams if the server requests it
            for (let i = 0; i < 4; i++) {
                if ((this._ctl >> i) & 1) {
                    this._zlibs[i]!.reset();
                    Log.Info("Reset zlib stream " + i);
                }
            }

            // Figure out filter
            this._ctl = this._ctl >> 4;
        }

        let ret: boolean;

        if (this._ctl === 0x08) {
            ret = this._fillRect(x, y, width, height,
                                 sock, display, depth);
        } else if (this._ctl === 0x09) {
            ret = this._jpegRect(x, y, width, height,
                                 sock, display, depth);
        } else if (this._ctl === 0x0A) {
            ret = this._pngRect(x, y, width, height,
                                sock, display, depth);
        } else if ((this._ctl! & 0x08) == 0) {
            ret = this._basicRect(this._ctl!, x, y, width, height,
                                  sock, display, depth);
        } else {
            throw new Error("Illegal tight compression received (ctl: " +
                                   this._ctl + ")");
        }

        if (ret) {
            this._ctl = null;
        }

        return ret;
    }

    protected _fillRect(x: number, y: number, width: number, height: number,
                        sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        if (sock.rQwait("TIGHT", 3)) {
            return false;
        }

        let pixel: Uint8Array = sock.rQshiftBytes(3);
        display.fillRect(x, y, width, height, pixel, false);

        return true;
    }

    protected _jpegRect(x: number, y: number, width: number, height: number,
                        sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        let data = this._readData(sock);
        if (data === null) {
            return false;
        }

        display.imageRect(x, y, width, height, "image/jpeg", data);

        return true;
    }

    protected _pngRect(x: number, y: number, width: number, height: number,
                       sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        throw new Error("PNG received in standard Tight rect");
    }

    protected _basicRect(ctl: number, x: number, y: number, width: number, height: number,
                         sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        if (this._filter === null) {
            if (ctl & 0x4) {
                if (sock.rQwait("TIGHT", 1)) {
                    return false;
                }

                this._filter = sock.rQshift8();
            } else {
                // Implicit CopyFilter
                this._filter = 0;
            }
        }

        let streamId: number = ctl & 0x3;

        let ret: boolean;

        switch (this._filter) {
            case 0: // CopyFilter
                ret = this._copyFilter(streamId, x, y, width, height,
                                       sock, display, depth);
                break;
            case 1: // PaletteFilter
                ret = this._paletteFilter(streamId, x, y, width, height,
                                          sock, display, depth);
                break;
            case 2: // GradientFilter
                ret = this._gradientFilter(streamId, x, y, width, height,
                                           sock, display, depth);
                break;
            default:
                throw new Error("Illegal tight filter received (ctl: " +
                                       this._filter + ")");
        }

        if (ret) {
            this._filter = null;
        }

        return ret;
    }

    private _copyFilter(streamId: number, x: number, y: number, width: number, height: number,
                        sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        const uncompressedSize: number = width * height * 3;
        let data: Uint8Array;

        if (uncompressedSize === 0) {
            return true;
        }

        if (uncompressedSize < 12) {
            if (sock.rQwait("TIGHT", uncompressedSize)) {
                return false;
            }

            data = sock.rQshiftBytes(uncompressedSize);
        } else {
            const compressedData = this._readData(sock);
            if (compressedData === null) {
                return false;
            }

            this._zlibs[streamId]!.setInput(compressedData);
            data = this._zlibs[streamId]!.inflate(uncompressedSize);
            this._zlibs[streamId]!.setInput(null);
        }

        let rgbx: Uint8Array = new Uint8Array(width * height * 4);
        for (let i = 0, j = 0; i < width * height * 4; i += 4, j += 3) {
            rgbx[i]     = data[j]!;
            rgbx[i + 1] = data[j + 1]!;
            rgbx[i + 2] = data[j + 2]!;
            rgbx[i + 3] = 255;  // Alpha
        }

        display.blitImage(x, y, width, height, rgbx, 0, false);

        return true;
    }

    private _paletteFilter(streamId: number, x: number, y: number, width: number, height: number,
                           sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        if (this._numColors === 0) {
            if (sock.rQwait("TIGHT palette", 1)) {
                return false;
            }

            const numColors: number = sock.rQpeek8() + 1;
            const paletteSize: number = numColors * 3;

            if (sock.rQwait("TIGHT palette", 1 + paletteSize)) {
                return false;
            }

            this._numColors = numColors;
            sock.rQskipBytes(1);

            sock.rQshiftTo(this._palette, paletteSize);
        }

        const bpp: number = (this._numColors <= 2) ? 1 : 8;
        const rowSize: number = Math.floor((width * bpp + 7) / 8);
        const uncompressedSize: number = rowSize * height;

        let data: Uint8Array;

        if (uncompressedSize === 0) {
            return true;
        }

        if (uncompressedSize < 12) {
            if (sock.rQwait("TIGHT", uncompressedSize)) {
                return false;
            }

            data = sock.rQshiftBytes(uncompressedSize);
        } else {
            const compressedData = this._readData(sock);
            if (compressedData === null) {
                return false;
            }

            this._zlibs[streamId]!.setInput(compressedData);
            data = this._zlibs[streamId]!.inflate(uncompressedSize);
            this._zlibs[streamId]!.setInput(null);
        }

        // Convert indexed (palette based) image data to RGB
        if (this._numColors == 2) {
            this._monoRect(x, y, width, height, data, this._palette, display);
        } else {
            this._paletteRect(x, y, width, height, data, this._palette, display);
        }

        this._numColors = 0;

        return true;
    }

    private _monoRect(x: number, y: number, width: number, height: number,
                      data: Uint8Array, palette: Uint8Array, display: DecoderDisplay): void {
        // Convert indexed (palette based) image data to RGB
        // TODO: reduce number of calculations inside loop
        const dest: Uint8Array = this._getScratchBuffer(width * height * 4);
        const w: number = Math.floor((width + 7) / 8);
        const w1: number = Math.floor(width / 8);

        for (let y = 0; y < height; y++) {
            let dp: number, sp: number, x: number;
            for (x = 0; x < w1; x++) {
                for (let b = 7; b >= 0; b--) {
                    dp = (y * width + x * 8 + 7 - b) * 4;
                    sp = (data[y * w + x]! >> b & 1) * 3;
                    dest[dp]     = palette[sp]!;
                    dest[dp + 1] = palette[sp + 1]!;
                    dest[dp + 2] = palette[sp + 2]!;
                    dest[dp + 3] = 255;
                }
            }

            for (let b = 7; b >= 8 - width % 8; b--) {
                dp = (y * width + x * 8 + 7 - b) * 4;
                sp = (data[y * w + x]! >> b & 1) * 3;
                dest[dp]     = palette[sp]!;
                dest[dp + 1] = palette[sp + 1]!;
                dest[dp + 2] = palette[sp + 2]!;
                dest[dp + 3] = 255;
            }
        }

        display.blitImage(x, y, width, height, dest, 0, false);
    }

    private _paletteRect(x: number, y: number, width: number, height: number,
                         data: Uint8Array, palette: Uint8Array, display: DecoderDisplay): void {
        // Convert indexed (palette based) image data to RGB
        const dest: Uint8Array = this._getScratchBuffer(width * height * 4);
        const total: number = width * height * 4;
        for (let i = 0, j = 0; i < total; i += 4, j++) {
            const sp: number = data[j]! * 3;
            dest[i]     = palette[sp]!;
            dest[i + 1] = palette[sp + 1]!;
            dest[i + 2] = palette[sp + 2]!;
            dest[i + 3] = 255;
        }

        display.blitImage(x, y, width, height, dest, 0, false);
    }

    private _gradientFilter(streamId: number, x: number, y: number, width: number, height: number,
                            sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        // assume the TPIXEL is 3 bytes long
        const uncompressedSize: number = width * height * 3;
        let data: Uint8Array;

        if (uncompressedSize === 0) {
            return true;
        }

        if (uncompressedSize < 12) {
            if (sock.rQwait("TIGHT", uncompressedSize)) {
                return false;
            }

            data = sock.rQshiftBytes(uncompressedSize);
        } else {
            const compressedData = this._readData(sock);
            if (compressedData === null) {
                return false;
            }

            this._zlibs[streamId]!.setInput(compressedData);
            data = this._zlibs[streamId]!.inflate(uncompressedSize);
            this._zlibs[streamId]!.setInput(null);
        }

        let rgbx: Uint8Array = new Uint8Array(4 * width * height);

        let rgbxIndex: number = 0, dataIndex: number = 0;
        let left: Uint8Array = new Uint8Array(3);
        for (let x = 0; x < width; x++) {
            for (let c = 0; c < 3; c++) {
                const prediction: number = left[c]!;
                const value: number = data[dataIndex++]! + prediction;
                rgbx[rgbxIndex++] = value;
                left[c] = value;
            }
            rgbx[rgbxIndex++] = 255;
        }

        let upperIndex: number = 0;
        let upper: Uint8Array = new Uint8Array(3),
            upperleft: Uint8Array = new Uint8Array(3);
        for (let y = 1; y < height; y++) {
            left.fill(0);
            upperleft.fill(0);
            for (let x = 0; x < width; x++) {
                for (let c = 0; c < 3; c++) {
                    upper[c] = rgbx[upperIndex++]!;
                    let prediction: number = left[c]! + upper[c]! - upperleft[c]!;
                    if (prediction < 0) {
                        prediction = 0;
                    } else if (prediction > 255) {
                        prediction = 255;
                    }
                    const value: number = data[dataIndex++]! + prediction;
                    rgbx[rgbxIndex++] = value;
                    upperleft[c] = upper[c]!;
                    left[c] = value;
                }
                rgbx[rgbxIndex++] = 255;
                upperIndex++;
            }
        }

        display.blitImage(x, y, width, height, rgbx, 0, false);

        return true;
    }

    protected _readData(sock: DecoderSock): Uint8Array | null {
        if (this._len === 0) {
            if (sock.rQwait("TIGHT", 3)) {
                return null;
            }

            let byte: number;

            byte = sock.rQshift8();
            this._len = byte & 0x7f;
            if (byte & 0x80) {
                byte = sock.rQshift8();
                this._len |= (byte & 0x7f) << 7;
                if (byte & 0x80) {
                    byte = sock.rQshift8();
                    this._len |= byte << 14;
                }
            }
        }

        if (sock.rQwait("TIGHT", this._len)) {
            return null;
        }

        let data: Uint8Array = sock.rQshiftBytes(this._len, false);
        this._len = 0;

        return data;
    }

    private _getScratchBuffer(size: number): Uint8Array {
        if (!this._scratchBuffer || (this._scratchBuffer.length < size)) {
            this._scratchBuffer = new Uint8Array(size);
        }
        return this._scratchBuffer;
    }
}
