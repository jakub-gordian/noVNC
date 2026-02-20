/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 *
 */

import * as Log from '../util/logging.ts';
import type { DecoderSock, DecoderDisplay } from '../types.ts';

export default class HextileDecoder {
    private _tiles: number;
    private _lastsubencoding: number;
    private _tileBuffer: Uint8Array;
    private _tilesX: number;
    private _tilesY: number;
    private _totalTiles: number;
    private _background: Uint8Array;
    private _foreground: Uint8Array;
    private _tileX: number;
    private _tileY: number;
    private _tileW: number;
    private _tileH: number;

    constructor() {
        this._tiles = 0;
        this._lastsubencoding = 0;
        this._tileBuffer = new Uint8Array(16 * 16 * 4);
        this._tilesX = 0;
        this._tilesY = 0;
        this._totalTiles = 0;
        this._background = new Uint8Array(4);
        this._foreground = new Uint8Array(4);
        this._tileX = 0;
        this._tileY = 0;
        this._tileW = 0;
        this._tileH = 0;
    }

    decodeRect(x: number, y: number, width: number, height: number,
               sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        if (this._tiles === 0) {
            this._tilesX = Math.ceil(width / 16);
            this._tilesY = Math.ceil(height / 16);
            this._totalTiles = this._tilesX * this._tilesY;
            this._tiles = this._totalTiles;
        }

        while (this._tiles > 0) {
            let bytes: number = 1;

            if (sock.rQwait("HEXTILE", bytes)) {
                return false;
            }

            let subencoding: number = sock.rQpeek8();
            if (subencoding > 30) {  // Raw
                throw new Error("Illegal hextile subencoding (subencoding: " +
                            subencoding + ")");
            }

            const currTile: number = this._totalTiles - this._tiles;
            const tileX: number = currTile % this._tilesX;
            const tileY: number = Math.floor(currTile / this._tilesX);
            const tx: number = x + tileX * 16;
            const ty: number = y + tileY * 16;
            const tw: number = Math.min(16, (x + width) - tx);
            const th: number = Math.min(16, (y + height) - ty);

            // Figure out how much we are expecting
            if (subencoding & 0x01) {  // Raw
                bytes += tw * th * 4;
            } else {
                if (subencoding & 0x02) {  // Background
                    bytes += 4;
                }
                if (subencoding & 0x04) {  // Foreground
                    bytes += 4;
                }
                if (subencoding & 0x08) {  // AnySubrects
                    bytes++;  // Since we aren't shifting it off

                    if (sock.rQwait("HEXTILE", bytes)) {
                        return false;
                    }

                    let subrects: number = sock.rQpeekBytes(bytes).at(-1)!;
                    if (subencoding & 0x10) {  // SubrectsColoured
                        bytes += subrects * (4 + 2);
                    } else {
                        bytes += subrects * 2;
                    }
                }
            }

            if (sock.rQwait("HEXTILE", bytes)) {
                return false;
            }

            // We know the encoding and have a whole tile
            sock.rQshift8();
            if (subencoding === 0) {
                if (this._lastsubencoding & 0x01) {
                    // Weird: ignore blanks are RAW
                    Log.Debug("     Ignoring blank after RAW");
                } else {
                    display.fillRect(tx, ty, tw, th, this._background);
                }
            } else if (subencoding & 0x01) {  // Raw
                let pixels: number = tw * th;
                let data: Uint8Array = sock.rQshiftBytes(pixels * 4, false);
                // Max sure the image is fully opaque
                for (let i = 0;i <  pixels;i++) {
                    data[i * 4 + 3] = 255;
                }
                display.blitImage(tx, ty, tw, th, data, 0);
            } else {
                if (subencoding & 0x02) {  // Background
                    this._background = new Uint8Array(sock.rQshiftBytes(4));
                }
                if (subencoding & 0x04) {  // Foreground
                    this._foreground = new Uint8Array(sock.rQshiftBytes(4));
                }

                this._startTile(tx, ty, tw, th, this._background);
                if (subencoding & 0x08) {  // AnySubrects
                    let subrects: number = sock.rQshift8();

                    for (let s = 0; s < subrects; s++) {
                        let color: Uint8Array;
                        if (subencoding & 0x10) {  // SubrectsColoured
                            color = sock.rQshiftBytes(4);
                        } else {
                            color = this._foreground;
                        }
                        const xy: number = sock.rQshift8();
                        const sx: number = (xy >> 4);
                        const sy: number = (xy & 0x0f);

                        const wh: number = sock.rQshift8();
                        const sw: number = (wh >> 4) + 1;
                        const sh: number = (wh & 0x0f) + 1;

                        this._subTile(sx, sy, sw, sh, color);
                    }
                }
                this._finishTile(display);
            }
            this._lastsubencoding = subencoding;
            this._tiles--;
        }

        return true;
    }

    // start updating a tile
    private _startTile(x: number, y: number, width: number, height: number, color: Uint8Array): void {
        this._tileX = x;
        this._tileY = y;
        this._tileW = width;
        this._tileH = height;

        const red: number = color[0];
        const green: number = color[1];
        const blue: number = color[2];

        const data: Uint8Array = this._tileBuffer;
        for (let i = 0; i < width * height * 4; i += 4) {
            data[i]     = red;
            data[i + 1] = green;
            data[i + 2] = blue;
            data[i + 3] = 255;
        }
    }

    // update sub-rectangle of the current tile
    private _subTile(x: number, y: number, w: number, h: number, color: Uint8Array): void {
        const red: number = color[0];
        const green: number = color[1];
        const blue: number = color[2];
        const xend: number = x + w;
        const yend: number = y + h;

        const data: Uint8Array = this._tileBuffer;
        const width: number = this._tileW;
        for (let j = y; j < yend; j++) {
            for (let i = x; i < xend; i++) {
                const p: number = (i + (j * width)) * 4;
                data[p]     = red;
                data[p + 1] = green;
                data[p + 2] = blue;
                data[p + 3] = 255;
            }
        }
    }

    // draw the current tile to the screen
    private _finishTile(display: DecoderDisplay): void {
        display.blitImage(this._tileX, this._tileY,
                          this._tileW, this._tileH,
                          this._tileBuffer, 0);
    }
}
