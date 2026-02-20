/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 */

interface ErrorEventLike {
    message: string;
    filename?: string;
    lineno?: number;
    colno?: number;
}

interface ErrorWithStack {
    stack?: string;
}

// Fallback for all uncaught errors
function handleError(event: ErrorEventLike, err?: ErrorWithStack | null): false {
    try {
        const msg = document.getElementById('noVNC_fallback_errormsg');

        // Work around Firefox bug:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1685038
        if (event.message === "ResizeObserver loop completed with undelivered notifications.") {
            return false;
        }

        // Only show the initial error
        if (msg && msg.hasChildNodes()) {
            return false;
        }

        if (!msg) {
            return false;
        }

        let div = document.createElement("div");
        div.classList.add('noVNC_message');
        div.appendChild(document.createTextNode(event.message));
        msg.appendChild(div);

        if (event.filename) {
            div = document.createElement("div");
            div.className = 'noVNC_location';
            let text = event.filename;
            if (event.lineno !== undefined) {
                text += ":" + event.lineno;
                if (event.colno !== undefined) {
                    text += ":" + event.colno;
                }
            }
            div.appendChild(document.createTextNode(text));
            msg.appendChild(div);
        }

        if (err && err.stack) {
            div = document.createElement("div");
            div.className = 'noVNC_stack';
            div.appendChild(document.createTextNode(err.stack));
            msg.appendChild(div);
        }

        document.getElementById('noVNC_fallback_error')
            ?.classList.add("noVNC_open");

    } catch (exc) {
        document.write("noVNC encountered an error.");
    }

    // Try to disable keyboard interaction, best effort
    try {
        // Remove focus from the currently focused element in order to
        // prevent keyboard interaction from continuing
        if (document.activeElement) { (document.activeElement as HTMLElement).blur(); }

        // Don't let any element be focusable when showing the error
        let keyboardFocusable = 'a[href], button, input, textarea, select, details, [tabindex]';
        document.querySelectorAll(keyboardFocusable).forEach((elem: Element) => {
            elem.setAttribute("tabindex", "-1");
        });
    } catch (exc) {
        // Do nothing
    }

    // Don't return true since this would prevent the error
    // from being printed to the browser console.
    return false;
}

window.addEventListener('error', (evt: ErrorEvent) => handleError(evt, evt.error as ErrorWithStack));
window.addEventListener('unhandledrejection', (evt: PromiseRejectionEvent) => handleError(evt.reason as ErrorEventLike, evt.reason as ErrorWithStack));
