/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 *
 */

import type { DecoderSock, DecoderDisplay } from '../types.ts';

export default class RREDecoder {
    private _subrects: number;

    constructor() {
        this._subrects = 0;
    }

    decodeRect(x: number, y: number, width: number, height: number,
               sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        if (this._subrects === 0) {
            if (sock.rQwait("RRE", 4 + 4)) {
                return false;
            }

            this._subrects = sock.rQshift32();

            let color: Uint8Array = sock.rQshiftBytes(4);  // Background
            display.fillRect(x, y, width, height, color);
        }

        while (this._subrects > 0) {
            if (sock.rQwait("RRE", 4 + 8)) {
                return false;
            }

            let color: Uint8Array = sock.rQshiftBytes(4);
            let sx: number = sock.rQshift16();
            let sy: number = sock.rQshift16();
            let swidth: number = sock.rQshift16();
            let sheight: number = sock.rQshift16();
            display.fillRect(x + sx, y + sy, swidth, sheight, color);

            this._subrects--;
        }

        return true;
    }
}
