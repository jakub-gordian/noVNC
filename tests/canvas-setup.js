// tests/canvas-setup.js
// Canvas polyfill for bun:test environment.
// Uses @napi-rs/canvas to provide real Canvas 2D context support
// since happy-dom's HTMLCanvasElement.getContext() returns null.

import { createCanvas, ImageData as NativeImageData } from "@napi-rs/canvas";

// Make ImageData available globally if happy-dom doesn't provide it
if (typeof globalThis.ImageData === "undefined") {
    globalThis.ImageData = NativeImageData;
}

// Patch document.createElement to return a canvas with working getContext('2d')
// when a 'canvas' element is requested. The @napi-rs/canvas CanvasElement has
// all the needed methods (getContext, toDataURL, toBlob, etc.) but lacks
// DOM-specific properties like `style` that noVNC's Display class uses.
const origCreateElement = document.createElement.bind(document);
document.createElement = function (tagName, options) {
    if (tagName.toLowerCase() === "canvas") {
        const canvas = createCanvas(0, 0);

        // Add a `style` property to mimic DOM element behavior.
        // Display._rescale() reads/writes style.width and style.height.
        if (!canvas.style) {
            canvas.style = {};
        }

        return canvas;
    }
    return origCreateElement(tagName, options);
};
