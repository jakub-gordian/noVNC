// tests/canvas-setup.js
// Canvas polyfill for bun:test environment.
// Uses @napi-rs/canvas to provide real Canvas 2D context support
// since happy-dom's HTMLCanvasElement.getContext() returns null.

import { createCanvas, ImageData as NativeImageData } from "@napi-rs/canvas";

// Make ImageData available globally if happy-dom doesn't provide it
if (typeof globalThis.ImageData === "undefined") {
    globalThis.ImageData = NativeImageData;
}

// Helper: given something that might be a DOM canvas with a _nativeCanvas,
// extract the native canvas for use with @napi-rs/canvas drawImage.
function resolveNativeCanvas(source) {
    if (source && source._nativeCanvas) {
        return source._nativeCanvas;
    }
    return source;
}

// Wrap a native 2D context so that drawImage resolves DOM canvases
// to their native backing canvases
function wrapContext(ctx) {
    const origDrawImage = ctx.drawImage.bind(ctx);
    ctx.drawImage = function (image, ...args) {
        return origDrawImage(resolveNativeCanvas(image), ...args);
    };
    return ctx;
}

// Patch document.createElement to return a happy-dom canvas element
// with a working getContext('2d') backed by @napi-rs/canvas.
// This allows the canvas to be used as a regular DOM node (appendChild, etc.)
// while still providing real 2D drawing capabilities.
const origCreateElement = document.createElement.bind(document);
document.createElement = function (tagName, options) {
    if (tagName.toLowerCase() === "canvas") {
        // Create a real happy-dom canvas element (can be used in DOM)
        const domCanvas = origCreateElement("canvas", options);

        // Create a single backing native canvas for actual 2D rendering.
        // We resize it in place rather than recreating, so contexts stay valid.
        const nativeCanvas = createCanvas(0, 0);
        let wrappedCtx = null;

        // Sync size: when the DOM canvas width/height is set,
        // also update the native canvas in place
        const widthDesc = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(domCanvas), "width"
        ) || { get() { return this._width || 0; }, set(v) { this._width = v; } };

        const heightDesc = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(domCanvas), "height"
        ) || { get() { return this._height || 0; }, set(v) { this._height = v; } };

        Object.defineProperty(domCanvas, "width", {
            get() { return widthDesc.get ? widthDesc.get.call(this) : (this._width || 0); },
            set(v) {
                if (widthDesc.set) widthDesc.set.call(this, v);
                else this._width = v;
                nativeCanvas.width = v;
            },
            configurable: true,
            enumerable: true,
        });

        Object.defineProperty(domCanvas, "height", {
            get() { return heightDesc.get ? heightDesc.get.call(this) : (this._height || 0); },
            set(v) {
                if (heightDesc.set) heightDesc.set.call(this, v);
                else this._height = v;
                nativeCanvas.height = v;
            },
            configurable: true,
            enumerable: true,
        });

        // Override getContext to return the native canvas's context (wrapped)
        domCanvas.getContext = function (contextType, contextAttributes) {
            if (contextType === "2d") {
                if (!wrappedCtx) {
                    wrappedCtx = wrapContext(nativeCanvas.getContext("2d", contextAttributes));
                }
                return wrappedCtx;
            }
            return null;
        };

        // Proxy toDataURL and toBlob to the native canvas
        domCanvas.toDataURL = function (...args) {
            return nativeCanvas.toDataURL(...args);
        };

        domCanvas.toBlob = function (...args) {
            return nativeCanvas.toBlob(...args);
        };

        // Override getBoundingClientRect to return dimensions based on the
        // canvas width/height, since happy-dom doesn't do layout.
        // This is critical for mouse event coordinate calculations.
        domCanvas.getBoundingClientRect = function () {
            return {
                left: 0,
                top: 0,
                right: nativeCanvas.width,
                bottom: nativeCanvas.height,
                width: nativeCanvas.width,
                height: nativeCanvas.height,
                x: 0,
                y: 0,
            };
        };

        // Store reference to native canvas for direct access if needed
        domCanvas._nativeCanvas = nativeCanvas;

        return domCanvas;
    }
    return origCreateElement(tagName, options);
};
