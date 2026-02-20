/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2024 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 *
 */

import * as Log from '../util/logging.ts';
import type { DecoderSock, DecoderDisplay, PendingFrame } from '../types.ts';

interface NalUnitInfo {
    slice?: boolean;
    key?: boolean;
}

interface ParsedFrame {
    frame: Uint8Array;
    key: boolean;
}

export class H264Parser {
    private _data: Uint8Array;
    private _index: number;
    public profileIdc: number | null;
    public constraintSet: number | null;
    public levelIdc: number | null;

    constructor(data: Uint8Array) {
        this._data = data;
        this._index = 0;
        this.profileIdc = null;
        this.constraintSet = null;
        this.levelIdc = null;
    }

    private _getStartSequenceLen(index: number): number {
        let data = this._data;
        if (data[index + 0] == 0 && data[index + 1] == 0 && data[index + 2] == 0 && data[index + 3] == 1) {
            return 4;
        }
        if (data[index + 0] == 0 && data[index + 1] == 0 && data[index + 2] == 1) {
            return 3;
        }
        return 0;
    }

    private _indexOfNextNalUnit(index: number): number {
        let data = this._data;
        for (let i = index; i < data.length; ++i) {
            if (this._getStartSequenceLen(i) != 0) {
                return i;
            }
        }
        return -1;
    }

    private _parseSps(index: number): void {
        this.profileIdc = this._data[index]!;
        this.constraintSet = this._data[index + 1]!;
        this.levelIdc = this._data[index + 2]!;
    }

    private _parseNalUnit(index: number): NalUnitInfo {
        const firstByte: number = this._data[index]!;
        if (firstByte & 0x80) {
            throw new Error('H264 parsing sanity check failed, forbidden zero bit is set');
        }
        const unitType: number = firstByte & 0x1f;

        switch (unitType) {
            case 1: // coded slice, non-idr
                return { slice: true };
            case 5: // coded slice, idr
                return { slice: true, key: true };
            case 6: // sei
                return {};
            case 7: // sps
                this._parseSps(index + 1);
                return {};
            case 8: // pps
                return {};
            default:
                Log.Warn("Unhandled unit type: ", unitType);
                break;
        }
        return {};
    }

    parse(): ParsedFrame | null {
        const startIndex: number = this._index;
        let isKey: boolean = false;

        while (this._index < this._data.length) {
            const startSequenceLen: number = this._getStartSequenceLen(this._index);
            if (startSequenceLen == 0) {
                throw new Error('Invalid start sequence in bit stream');
            }

            const { slice, key } = this._parseNalUnit(this._index + startSequenceLen);

            let nextIndex: number = this._indexOfNextNalUnit(this._index + startSequenceLen);
            if (nextIndex == -1) {
                this._index = this._data.length;
            } else {
                this._index = nextIndex;
            }

            if (key) {
                isKey = true;
            }
            if (slice) {
                break;
            }
        }

        if (startIndex === this._index) {
            return null;
        }

        return {
            frame: this._data.subarray(startIndex, this._index),
            key: isKey,
        };
    }
}

export class H264Context {
    public lastUsed: number;
    private _width: number;
    private _height: number;
    private _profileIdc: number | null;
    private _constraintSet: number | null;
    private _levelIdc: number | null;
    private _decoder: VideoDecoder | null;
    private _pendingFrames: PendingFrame[];

    constructor(width: number, height: number) {
        this.lastUsed = 0;
        this._width = width;
        this._height = height;
        this._profileIdc = null;
        this._constraintSet = null;
        this._levelIdc = null;
        this._decoder = null;
        this._pendingFrames = [];
    }

    private _handleFrame(frame: VideoFrame): void {
        let pending = this._pendingFrames.shift();
        if (pending === undefined) {
            throw new Error("Pending frame queue empty when receiving frame from decoder");
        }

        if (pending.timestamp != frame.timestamp) {
            throw new Error("Video frame timestamp mismatch. Expected " +
                frame.timestamp + " but but got " + pending.timestamp);
        }

        pending.frame = frame;
        pending.ready = true;
        pending.resolve!();

        if (!pending.keep) {
            frame.close();
        }
    }

    private _handleError(e: DOMException): void {
        throw new Error("Failed to decode frame: " + e.message);
    }

    private _configureDecoder(profileIdc: number, constraintSet: number, levelIdc: number): void {
        if (this._decoder === null || this._decoder.state === 'closed') {
            this._decoder = new VideoDecoder({
                output: (frame: VideoFrame) => this._handleFrame(frame),
                error: (e: DOMException) => this._handleError(e),
            });
        }
        const codec: string = 'avc1.' +
            profileIdc.toString(16).padStart(2, '0') +
            constraintSet.toString(16).padStart(2, '0') +
            levelIdc.toString(16).padStart(2, '0');
        this._decoder.configure({
            codec: codec,
            codedWidth: this._width,
            codedHeight: this._height,
            optimizeForLatency: true,
        });
    }

    private _preparePendingFrame(timestamp: number): PendingFrame {
        let pending: PendingFrame = {
            timestamp: timestamp,
            promise: null,
            resolve: null,
            frame: null,
            ready: false,
            keep: false,
        };
        pending.promise = new Promise<void>((resolve) => {
            pending.resolve = resolve;
        });
        this._pendingFrames.push(pending);

        return pending;
    }

    decode(payload: Uint8Array): PendingFrame | null {
        let parser = new H264Parser(payload);
        let result: PendingFrame | null = null;

        // Ideally, this timestamp should come from the server, but we'll just
        // approximate it instead.
        let timestamp: number = Math.round(window.performance.now() * 1e3);

        while (true) {
            let encodedFrame = parser.parse();
            if (encodedFrame === null) {
                break;
            }

            if (parser.profileIdc !== null) {
                this._profileIdc = parser.profileIdc;
                this._constraintSet = parser.constraintSet;
                this._levelIdc = parser.levelIdc;
            }

            if (this._decoder === null || this._decoder.state !== 'configured') {
                if (!encodedFrame.key) {
                    Log.Warn("Missing key frame. Can't decode until one arrives");
                    continue;
                }
                if (this._profileIdc === null) {
                    Log.Warn('Cannot config decoder. Have not received SPS and PPS yet.');
                    continue;
                }
                this._configureDecoder(this._profileIdc, this._constraintSet!,
                                       this._levelIdc!);
            }

            result = this._preparePendingFrame(timestamp);

            const chunk = new EncodedVideoChunk({
                timestamp: timestamp,
                type: encodedFrame.key ? 'key' : 'delta',
                data: encodedFrame.frame as unknown as BufferSource,
            });

            try {
                this._decoder!.decode(chunk);
            } catch (e) {
                Log.Warn("Failed to decode:", e);
            }
        }

        // We only keep last frame of each payload
        if (result !== null) {
            result.keep = true;
        }

        return result;
    }
}

export default class H264Decoder {
    private _tick: number;
    private _contexts: Record<string, H264Context>;

    constructor() {
        this._tick = 0;
        this._contexts = {};
    }

    private _contextId(x: number, y: number, width: number, height: number): string {
        return [x, y, width, height].join(',');
    }

    private _findOldestContextId(): string | undefined {
        let oldestTick: number = Number.MAX_VALUE;
        let oldestKey: string | undefined = undefined;
        for (const [key, value] of Object.entries(this._contexts)) {
            if (value.lastUsed < oldestTick) {
                oldestTick = value.lastUsed;
                oldestKey = key;
            }
        }
        return oldestKey;
    }

    private _createContext(x: number, y: number, width: number, height: number): H264Context {
        const maxContexts: number = 64;
        if (Object.keys(this._contexts).length >= maxContexts) {
            let oldestContextId = this._findOldestContextId();
            if (oldestContextId !== undefined) {
                delete this._contexts[oldestContextId];
            }
        }
        let context = new H264Context(width, height);
        this._contexts[this._contextId(x, y, width, height)] = context;
        return context;
    }

    private _getContext(x: number, y: number, width: number, height: number): H264Context {
        let context = this._contexts[this._contextId(x, y, width, height)];
        return context !== undefined ? context : this._createContext(x, y, width, height);
    }

    private _resetContext(x: number, y: number, width: number, height: number): void {
        delete this._contexts[this._contextId(x, y, width, height)];
    }

    private _resetAllContexts(): void {
        this._contexts = {};
    }

    decodeRect(x: number, y: number, width: number, height: number,
               sock: DecoderSock, display: DecoderDisplay, depth: number): boolean {
        const resetContextFlag: number = 1;
        const resetAllContextsFlag: number = 2;

        if (sock.rQwait("h264 header", 8)) {
            return false;
        }

        const length: number = sock.rQshift32();
        const flags: number = sock.rQshift32();

        if (sock.rQwait("h264 payload", length, 8)) {
            return false;
        }

        if (flags & resetAllContextsFlag) {
            this._resetAllContexts();
        } else if (flags & resetContextFlag) {
            this._resetContext(x, y, width, height);
        }

        let context = this._getContext(x, y, width, height);
        context.lastUsed = this._tick++;

        if (length !== 0) {
            let payload: Uint8Array = sock.rQshiftBytes(length, false);
            let frame = context.decode(payload);
            if (frame !== null) {
                display.videoFrame(x, y, width, height, frame);
            }
        }

        return true;
    }
}
