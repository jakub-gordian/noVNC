/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 *
 */

import TightDecoder from './tight.ts';
import type { DecoderSock, DecoderDisplay } from '../types.ts';

export default class TightPNGDecoder extends TightDecoder {
    protected override _pngRect(x: number, y: number, width: number, height: number,
                       sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        let data = this._readData(sock);
        if (data === null) {
            return false;
        }

        display.imageRect(x, y, width, height, "image/png", data);

        return true;
    }

    protected override _basicRect(ctl: number, x: number, y: number, width: number, height: number,
                         sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        throw new Error("BasicCompression received in TightPNG rect");
    }
}
