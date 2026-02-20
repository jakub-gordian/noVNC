/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 */

type EventCallback = (event: CustomEvent | Event) => void;

export default class EventTargetMixin {
    _listeners: Map<string, Set<EventCallback>>;

    constructor() {
        this._listeners = new Map();
    }

    addEventListener(type: string, callback: EventCallback): void {
        if (!this._listeners.has(type)) {
            this._listeners.set(type, new Set());
        }
        this._listeners.get(type)!.add(callback);
    }

    removeEventListener(type: string, callback: EventCallback): void {
        if (this._listeners.has(type)) {
            this._listeners.get(type)!.delete(callback);
        }
    }

    dispatchEvent(event: Event): boolean {
        if (!this._listeners.has(event.type)) {
            return true;
        }
        this._listeners.get(event.type)!
            .forEach(callback => callback.call(this, event));
        return !event.defaultPrevented;
    }
}
