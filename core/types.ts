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
