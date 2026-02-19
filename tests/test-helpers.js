// tests/test-helpers.js
// Custom matchers for bun:test's expect

import { expect } from "bun:test";

expect.extend({
    toHaveDisplayed(display, targetData, cmp) {
        const _equal = (a, b) => a === b;
        const comparator = cmp || _equal;
        const ctx = display._target.getContext('2d');
        const data = ctx.getImageData(0, 0, display._target.width, display._target.height).data;

        if (data.length !== targetData.length) {
            return {
                pass: false,
                message: () => `Display size mismatch: expected ${targetData.length} bytes, got ${data.length}`,
            };
        }

        let same = true;
        for (let i = 0; i < data.length; i++) {
            if (!comparator(data[i], targetData[i])) {
                same = false;
                break;
            }
        }

        return {
            pass: same,
            message: () => same
                ? `Expected display not to match target data`
                : `Expected display to match target data`,
        };
    },

    toHaveSent(rfb, targetData) {
        const data = rfb._websocket._getSentData();
        let same = true;
        if (data.length !== targetData.length) {
            same = false;
        } else {
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== targetData[i]) {
                    same = false;
                    break;
                }
            }
        }

        return {
            pass: same,
            message: () => same
                ? `Expected RFB not to have sent ${Array.from(targetData)}`
                : `Expected RFB to have sent ${Array.from(targetData)}, but got ${Array.from(data)}`,
        };
    },

    toEqualArray(received, expected) {
        let same = true;
        if (received.length !== expected.length) {
            same = false;
        } else {
            for (let i = 0; i < received.length; i++) {
                if (received[i] !== expected[i]) {
                    same = false;
                    break;
                }
            }
        }

        return {
            pass: same,
            message: () => same
                ? `Expected arrays not to be equal`
                : `Expected arrays to be equal`,
        };
    },
});
