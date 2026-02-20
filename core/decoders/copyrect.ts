/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 *
 */

import type { DecoderSock, DecoderDisplay } from '../types.ts';

export default class CopyRectDecoder {
    decodeRect(x: number, y: number, width: number, height: number,
               sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        if (sock.rQwait("COPYRECT", 4)) {
            return false;
        }

        let deltaX: number = sock.rQshift16();
        let deltaY: number = sock.rQshift16();

        if ((width === 0) || (height === 0)) {
            return true;
        }

        display.copyImage(deltaX, deltaY, x, y, width, height);

        return true;
    }
}
