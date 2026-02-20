/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2024 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * Shared TypeScript type definitions for noVNC
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';
export type LogFunction = (...args: unknown[]) => void;

export interface Position {
    x: number;
    y: number;
}

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface DamageBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export type RawChannel = WebSocket | RTCDataChannel;

export type ConnectionState = 'connecting' | 'connected' | 'disconnecting' | 'disconnected';

export interface RFBCredentials {
    username?: string;
    password?: string;
    target?: string;
}

export interface RFBOptions {
    shared?: boolean;
    credentials?: RFBCredentials;
    repeaterID?: string;
    wsProtocols?: string[];
    showDotCursor?: boolean;
    clipViewport?: boolean;
    dragViewport?: boolean;
    scaleViewport?: boolean;
    resizeSession?: boolean;
    qualityLevel?: number;
    compressionLevel?: number;
}

export interface WebsockEventHandlers {
    message: (() => void) | null;
    open: (() => void) | null;
    close: ((e: CloseEvent) => void) | null;
    error: ((e: Event) => void) | null;
}

/** Interface for Websock methods used by decoders */
export interface DecoderSock {
    rQwait(msg: string, num: number, goback?: number): boolean;
    rQshift8(): number;
    rQshift16(): number;
    rQshift32(): number;
    rQpeek8(): number;
    rQshiftBytes(len: number, copy?: boolean): Uint8Array;
    rQpeekBytes(len: number, copy?: boolean): Uint8Array;
    rQskipBytes(bytes: number): void;
    rQshiftTo(target: Uint8Array, len: number): void;
}

/** Interface for Display methods used by decoders */
export interface DecoderDisplay {
    fillRect(x: number, y: number, width: number, height: number,
             color: Uint8Array | number[], fromQueue?: boolean): void;
    copyImage(oldX: number, oldY: number, newX: number, newY: number,
              w: number, h: number, fromQueue?: boolean): void;
    blitImage(x: number, y: number, width: number, height: number,
              arr: Uint8Array, offset: number, fromQueue?: boolean): void;
    imageRect(x: number, y: number, width: number, height: number,
              mime: string, arr: Uint8Array): void;
    videoFrame(x: number, y: number, width: number, height: number,
               frame: PendingFrame): void;
}

/** Pending decoded video frame */
export interface PendingFrame {
    timestamp: number;
    promise: Promise<void> | null;
    resolve: (() => void) | null;
    frame: VideoFrame | null;
    ready: boolean;
    keep: boolean;
}
