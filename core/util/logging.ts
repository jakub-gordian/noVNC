/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 */

/*
 * Logging/debug routines
 */

import type { LogLevel, LogFunction } from '../types.ts';

let _logLevel: LogLevel = 'warn';

let Debug: LogFunction = () => {};
let Info: LogFunction = () => {};
let Warn: LogFunction = () => {};
let Error: LogFunction = () => {};

export function initLogging(level?: LogLevel): void {
    if (typeof level === 'undefined') {
        level = _logLevel;
    } else {
        _logLevel = level;
    }

    Debug = Info = Warn = Error = () => {};

    if (typeof window.console !== "undefined") {
        /* eslint-disable no-console */
        switch (level) {
            case 'debug':
                Debug = console.debug.bind(window.console);
                Info  = console.info.bind(window.console);
                Warn  = console.warn.bind(window.console);
                Error = console.error.bind(window.console);
                break;
            case 'info':
                Info  = console.info.bind(window.console);
                Warn  = console.warn.bind(window.console);
                Error = console.error.bind(window.console);
                break;
            case 'warn':
                Warn  = console.warn.bind(window.console);
                Error = console.error.bind(window.console);
                break;
            case 'error':
                Error = console.error.bind(window.console);
                break;
            case 'none':
                break;
            default:
                throw new window.Error("invalid logging type '" + level + "'");
        }
        /* eslint-enable no-console */
    }
}

export function getLogging(): LogLevel {
    return _logLevel;
}

export { Debug, Info, Warn, Error };

// Initialize logging level
initLogging();
