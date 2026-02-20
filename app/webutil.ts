/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 */

import * as Log from '../core/util/logging.ts';

declare global {
    interface Window {
        chrome?: {
            storage?: {
                sync: {
                    get(callback: (items: Record<string, string>) => void): void;
                    set(items: Record<string, string>): void;
                    remove(key: string): void;
                };
            };
        };
    }
}

// init log level reading the logging HTTP param
export function initLogging(level?: string): void {
    "use strict";
    if (typeof level !== "undefined") {
        Log.initLogging(level as Parameters<typeof Log.initLogging>[0]);
    } else {
        const param = document.location.href.match(/logging=([A-Za-z0-9._-]*)/);
        Log.initLogging(param ? param[1] as Parameters<typeof Log.initLogging>[0] : undefined);
    }
}

// Read a query string variable
// A URL with a query parameter can look like this (But will most probably get logged on the http server):
// https://www.example.com?myqueryparam=myvalue
//
// For privacy (Using a hastag #, the parameters will not be sent to the server)
// the url can be requested in the following way:
// https://www.example.com#myqueryparam=myvalue
//
// Even mixing public and non public parameters will work:
// https://www.example.com?nonsecretparam=example.com#password=secretvalue
export function getQueryVar(name: string, defVal?: string | null): string | null {
    "use strict";
    const re = new RegExp('.*[?&]' + name + '=([^&#]*)'),
          match = document.location.href.match(re);
    if (typeof defVal === 'undefined') { defVal = null; }

    if (match) {
        return decodeURIComponent(match[1]);
    }

    return defVal;
}

// Read a hash fragment variable
export function getHashVar(name: string, defVal?: string | null): string | null {
    "use strict";
    const re = new RegExp('.*[&#]' + name + '=([^&]*)'),
          match = document.location.hash.match(re);
    if (typeof defVal === 'undefined') { defVal = null; }

    if (match) {
        return decodeURIComponent(match[1]);
    }

    return defVal;
}

// Read a variable from the fragment or the query string
// Fragment takes precedence
export function getConfigVar(name: string, defVal?: string | null): string | null {
    "use strict";
    const val = getHashVar(name);

    if (val === null) {
        return getQueryVar(name, defVal);
    }

    return val;
}

/*
 * Cookie handling. Dervied from: http://www.quirksmode.org/js/cookies.html
 */

// No days means only for this browser session
export function createCookie(name: string, value: string, days?: number): void {
    "use strict";
    let date: Date, expires: string;
    if (days) {
        date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    } else {
        expires = "";
    }

    let secure: string;
    if (document.location.protocol === "https:") {
        secure = "; secure";
    } else {
        secure = "";
    }
    document.cookie = name + "=" + value + expires + "; path=/" + secure;
}

export function readCookie(name: string, defaultValue?: string): string | null {
    "use strict";
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');

    for (let i = 0; i < ca.length; i += 1) {
        let c = ca[i];
        while (c.charAt(0) === ' ') {
            c = c.substring(1, c.length);
        }
        if (c.indexOf(nameEQ) === 0) {
            return c.substring(nameEQ.length, c.length);
        }
    }

    return (typeof defaultValue !== 'undefined') ? defaultValue : null;
}

export function eraseCookie(name: string): void {
    "use strict";
    createCookie(name, "", -1);
}

/*
 * Setting handling.
 */

let settings: Record<string, string | null> = {};

export function initSettings(): Promise<void> {
    if (!window.chrome || !window.chrome.storage) {
        settings = {};
        return Promise.resolve();
    }

    return new Promise<Record<string, string | null>>(resolve => window.chrome!.storage!.sync.get(resolve as (items: Record<string, string>) => void))
        .then((cfg) => { settings = cfg; });
}

// Update the settings cache, but do not write to permanent storage
export function setSetting(name: string, value: string): void {
    settings[name] = value;
}

// No days means only for this browser session
export function writeSetting(name: string, value: string): void {
    "use strict";
    if (settings[name] === value) return;
    settings[name] = value;
    if (window.chrome && window.chrome.storage) {
        window.chrome.storage.sync.set(settings as unknown as Record<string, string>);
    } else {
        localStorageSet(name, value);
    }
}

export function readSetting(name: string, defaultValue?: string): string | null {
    "use strict";
    let value: string | null | undefined;
    if ((name in settings) || (window.chrome && window.chrome.storage)) {
        value = settings[name];
    } else {
        value = localStorageGet(name);
        settings[name] = value ?? null;
    }
    if (typeof value === "undefined") {
        value = null;
    }

    if (value === null && typeof defaultValue !== "undefined") {
        return defaultValue;
    }

    return value;
}

export function eraseSetting(name: string): void {
    "use strict";
    // Deleting here means that next time the setting is read when using local
    // storage, it will be pulled from local storage again.
    // If the setting in local storage is changed (e.g. in another tab)
    // between this delete and the next read, it could lead to an unexpected
    // value change.
    delete settings[name];
    if (window.chrome && window.chrome.storage) {
        window.chrome.storage.sync.remove(name);
    } else {
        localStorageRemove(name);
    }
}

let loggedMsgs: string[] = [];
function logOnce(msg: string, level: string = "warn"): void {
    if (!loggedMsgs.includes(msg)) {
        switch (level) {
            case "error":
                Log.Error(msg);
                break;
            case "warn":
                Log.Warn(msg);
                break;
            case "debug":
                Log.Debug(msg);
                break;
            default:
                Log.Info(msg);
        }
        loggedMsgs.push(msg);
    }
}

let cookiesMsg: string = "Couldn't access noVNC settings, are cookies disabled?";

function localStorageGet(name: string): string | null | undefined {
    let r: string | null | undefined;
    try {
        r = localStorage.getItem(name);
    } catch (e) {
        if (e instanceof DOMException) {
            logOnce(cookiesMsg);
            logOnce("'localStorage.getItem(" + name + ")' failed: " + e,
                    "debug");
        } else {
            throw e;
        }
    }
    return r;
}
function localStorageSet(name: string, value: string): void {
    try {
        localStorage.setItem(name, value);
    } catch (e) {
        if (e instanceof DOMException) {
            logOnce(cookiesMsg);
            logOnce("'localStorage.setItem(" + name + "," + value +
                    ")' failed: " + e, "debug");
        } else {
            throw e;
        }
    }
}
function localStorageRemove(name: string): void {
    try {
        localStorage.removeItem(name);
    } catch (e) {
        if (e instanceof DOMException) {
            logOnce(cookiesMsg);
            logOnce("'localStorage.removeItem(" + name + ")' failed: " + e,
                    "debug");
        } else {
            throw e;
        }
    }
}
