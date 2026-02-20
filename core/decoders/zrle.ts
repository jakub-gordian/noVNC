/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2021 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 *
 */

import Inflate from "../inflator.ts";
import type { DecoderSock, DecoderDisplay } from '../types.ts';

const ZRLE_TILE_WIDTH: number = 64;
const ZRLE_TILE_HEIGHT: number = 64;

export default class ZRLEDecoder {
    private _length: number;
    private _inflator: Inflate;
    private _pixelBuffer: Uint8Array;
    private _tileBuffer: Uint8Array;

    constructor() {
        this._length = 0;
        this._inflator = new Inflate();

        this._pixelBuffer = new Uint8Array(ZRLE_TILE_WIDTH * ZRLE_TILE_HEIGHT * 4);
        this._tileBuffer = new Uint8Array(ZRLE_TILE_WIDTH * ZRLE_TILE_HEIGHT * 4);
    }

    decodeRect(x: number, y: number, width: number, height: number,
               sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        if (this._length === 0) {
            if (sock.rQwait("ZLib data length", 4)) {
                return false;
            }
            this._length = sock.rQshift32();
        }
        if (sock.rQwait("Zlib data", this._length)) {
            return false;
        }

        const data: Uint8Array = sock.rQshiftBytes(this._length, false);

        this._inflator.setInput(data);

        for (let ty = y; ty < y + height; ty += ZRLE_TILE_HEIGHT) {
            let th: number = Math.min(ZRLE_TILE_HEIGHT, y + height - ty);

            for (let tx = x; tx < x + width; tx += ZRLE_TILE_WIDTH) {
                let tw: number = Math.min(ZRLE_TILE_WIDTH, x + width - tx);

                const tileSize: number = tw * th;
                const subencoding: number = this._inflator.inflate(1)[0]!;
                if (subencoding === 0) {
                    // raw data
                    const tileData: Uint8Array = this._readPixels(tileSize);
                    display.blitImage(tx, ty, tw, th, tileData, 0, false);
                } else if (subencoding === 1) {
                    // solid
                    const background: Uint8Array = this._readPixels(1);
                    display.fillRect(tx, ty, tw, th, [background[0]!, background[1]!, background[2]!]);
                } else if (subencoding >= 2 && subencoding <= 16) {
                    const tileData: Uint8Array = this._decodePaletteTile(subencoding, tileSize, tw, th);
                    display.blitImage(tx, ty, tw, th, tileData, 0, false);
                } else if (subencoding === 128) {
                    const tileData: Uint8Array = this._decodeRLETile(tileSize);
                    display.blitImage(tx, ty, tw, th, tileData, 0, false);
                } else if (subencoding >= 130 && subencoding <= 255) {
                    const tileData: Uint8Array = this._decodeRLEPaletteTile(subencoding - 128, tileSize);
                    display.blitImage(tx, ty, tw, th, tileData, 0, false);
                } else {
                    throw new Error('Unknown subencoding: ' + subencoding);
                }
            }
        }
        this._length = 0;
        return true;
    }

    private _getBitsPerPixelInPalette(paletteSize: number): number {
        if (paletteSize <= 2) {
            return 1;
        } else if (paletteSize <= 4) {
            return 2;
        } else if (paletteSize <= 16) {
            return 4;
        }
        // Should not reach here based on usage, but return a safe default
        return 4;
    }

    private _readPixels(pixels: number): Uint8Array {
        let data: Uint8Array = this._pixelBuffer;
        const buffer: Uint8Array = this._inflator.inflate(3*pixels);
        for (let i = 0, j = 0; i < pixels*4; i += 4, j += 3) {
            data[i]     = buffer[j]!;
            data[i + 1] = buffer[j + 1]!;
            data[i + 2] = buffer[j + 2]!;
            data[i + 3] = 255;  // Add the Alpha
        }
        return data;
    }

    private _decodePaletteTile(paletteSize: number, tileSize: number,
                               tilew: number, tileh: number): Uint8Array {
        const data: Uint8Array = this._tileBuffer;
        const palette: Uint8Array = this._readPixels(paletteSize);
        const bitsPerPixel: number = this._getBitsPerPixelInPalette(paletteSize);
        const mask: number = (1 << bitsPerPixel) - 1;

        let offset: number = 0;
        let encoded: number = this._inflator.inflate(1)[0]!;

        for (let y=0; y<tileh; y++) {
            let shift: number = 8-bitsPerPixel;
            for (let x=0; x<tilew; x++) {
                if (shift<0) {
                    shift=8-bitsPerPixel;
                    encoded = this._inflator.inflate(1)[0]!;
                }
                let indexInPalette: number = (encoded>>shift) & mask;

                data[offset] = palette[indexInPalette * 4]!;
                data[offset + 1] = palette[indexInPalette * 4 + 1]!;
                data[offset + 2] = palette[indexInPalette * 4 + 2]!;
                data[offset + 3] = palette[indexInPalette * 4 + 3]!;
                offset += 4;
                shift-=bitsPerPixel;
            }
            if (shift<8-bitsPerPixel && y<tileh-1) {
                encoded =  this._inflator.inflate(1)[0]!;
            }
        }
        return data;
    }

    private _decodeRLETile(tileSize: number): Uint8Array {
        const data: Uint8Array = this._tileBuffer;
        let i: number = 0;
        while (i < tileSize) {
            const pixel: Uint8Array = this._readPixels(1);
            const length: number = this._readRLELength();
            for (let j = 0; j < length; j++) {
                data[i * 4] = pixel[0]!;
                data[i * 4 + 1] = pixel[1]!;
                data[i * 4 + 2] = pixel[2]!;
                data[i * 4 + 3] = pixel[3]!;
                i++;
            }
        }
        return data;
    }

    private _decodeRLEPaletteTile(paletteSize: number, tileSize: number): Uint8Array {
        const data: Uint8Array = this._tileBuffer;

        // palette
        const palette: Uint8Array = this._readPixels(paletteSize);

        let offset: number = 0;
        while (offset < tileSize) {
            let indexInPalette: number = this._inflator.inflate(1)[0]!;
            let length: number = 1;
            if (indexInPalette >= 128) {
                indexInPalette -= 128;
                length = this._readRLELength();
            }
            if (indexInPalette > paletteSize) {
                throw new Error('Too big index in palette: ' + indexInPalette + ', palette size: ' + paletteSize);
            }
            if (offset + length > tileSize) {
                throw new Error('Too big rle length in palette mode: ' + length + ', allowed length is: ' + (tileSize - offset));
            }

            for (let j = 0; j < length; j++) {
                data[offset * 4] = palette[indexInPalette * 4]!;
                data[offset * 4 + 1] = palette[indexInPalette * 4 + 1]!;
                data[offset * 4 + 2] = palette[indexInPalette * 4 + 2]!;
                data[offset * 4 + 3] = palette[indexInPalette * 4 + 3]!;
                offset++;
            }
        }
        return data;
    }

    private _readRLELength(): number {
        let length: number = 0;
        let current: number = 0;
        do {
            current = this._inflator.inflate(1)[0]!;
            length += current;
        } while (current === 255);
        return length + 1;
    }
}
