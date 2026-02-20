/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 *
 */

import type { DecoderSock, DecoderDisplay } from '../types.ts';

export default class JPEGDecoder {
    private _cachedQuantTables: Uint8Array[];
    private _cachedHuffmanTables: Uint8Array[];
    private _segments: Uint8Array[];

    constructor() {
        // RealVNC will reuse the quantization tables
        // and Huffman tables, so we need to cache them.
        this._cachedQuantTables = [];
        this._cachedHuffmanTables = [];

        this._segments = [];
    }

    decodeRect(x: number, y: number, width: number, height: number,
               sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        // A rect of JPEG encodings is simply a JPEG file
        while (true) {
            let segment = this._readSegment(sock);
            if (segment === null) {
                return false;
            }
            this._segments.push(segment);
            // End of image?
            if (segment[1] === 0xD9) {
                break;
            }
        }

        let huffmanTables: Uint8Array[] = [];
        let quantTables: Uint8Array[] = [];
        for (let segment of this._segments) {
            let type: number = segment[1];
            if (type === 0xC4) {
                // Huffman tables
                huffmanTables.push(segment);
            } else if (type === 0xDB) {
                // Quantization tables
                quantTables.push(segment);
            }
        }

        const sofIndex: number = this._segments.findIndex(
            x => x[1] == 0xC0 || x[1] == 0xC2
        );
        if (sofIndex == -1) {
            throw new Error("Illegal JPEG image without SOF");
        }

        if (quantTables.length === 0) {
            this._segments.splice(sofIndex+1, 0,
                                  ...this._cachedQuantTables);
        }
        if (huffmanTables.length === 0) {
            this._segments.splice(sofIndex+1, 0,
                                  ...this._cachedHuffmanTables);
        }

        let length: number = 0;
        for (let segment of this._segments) {
            length += segment.length;
        }

        let data: Uint8Array = new Uint8Array(length);
        length = 0;
        for (let segment of this._segments) {
            data.set(segment, length);
            length += segment.length;
        }

        display.imageRect(x, y, width, height, "image/jpeg", data);

        if (huffmanTables.length !== 0) {
            this._cachedHuffmanTables = huffmanTables;
        }
        if (quantTables.length !== 0) {
            this._cachedQuantTables = quantTables;
        }

        this._segments = [];

        return true;
    }

    private _readSegment(sock: DecoderSock): Uint8Array | null {
        if (sock.rQwait("JPEG", 2)) {
            return null;
        }

        let marker: number = sock.rQshift8();
        if (marker != 0xFF) {
            throw new Error("Illegal JPEG marker received (byte: " +
                               marker + ")");
        }
        let type: number = sock.rQshift8();
        if (type >= 0xD0 && type <= 0xD9 || type == 0x01) {
            // No length after marker
            return new Uint8Array([marker, type]);
        }

        if (sock.rQwait("JPEG", 2, 2)) {
            return null;
        }

        let length: number = sock.rQshift16();
        if (length < 2) {
            throw new Error("Illegal JPEG length received (length: " +
                               length + ")");
        }

        if (sock.rQwait("JPEG", length-2, 4)) {
            return null;
        }

        let extra: number = 0;
        if (type === 0xDA) {
            // start of scan
            extra += 2;
            while (true) {
                if (sock.rQwait("JPEG", length-2+extra, 4)) {
                    return null;
                }
                let peekData: Uint8Array = sock.rQpeekBytes(length-2+extra, false);
                if (peekData.at(-2) === 0xFF && peekData.at(-1) !== 0x00 &&
                    !(peekData.at(-1)! >= 0xD0 && peekData.at(-1)! <= 0xD7)) {
                    extra -= 2;
                    break;
                }
                extra++;
            }
        }

        let segment: Uint8Array = new Uint8Array(2 + length + extra);
        segment[0] = marker;
        segment[1] = type;
        segment[2] = length >> 8;
        segment[3] = length;
        segment.set(sock.rQshiftBytes(length-2+extra, false), 4);

        return segment;
    }
}
