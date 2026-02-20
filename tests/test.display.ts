// @ts-nocheck
import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from "bun:test";
import "./test-helpers.ts";

import Base64 from '../core/base64.ts';
import Display from '../core/display.ts';

describe('Display/Canvas helper', function () {
    const checkedData = new Uint8ClampedArray([
        0x00, 0x00, 0xff, 255, 0x00, 0x00, 0xff, 255, 0x00, 0xff, 0x00, 255, 0x00, 0xff, 0x00, 255,
        0x00, 0x00, 0xff, 255, 0x00, 0x00, 0xff, 255, 0x00, 0xff, 0x00, 255, 0x00, 0xff, 0x00, 255,
        0x00, 0xff, 0x00, 255, 0x00, 0xff, 0x00, 255, 0x00, 0x00, 0xff, 255, 0x00, 0x00, 0xff, 255,
        0x00, 0xff, 0x00, 255, 0x00, 0xff, 0x00, 255, 0x00, 0x00, 0xff, 255, 0x00, 0x00, 0xff, 255
    ]);

    const basicData = new Uint8ClampedArray([0xff, 0x00, 0x00, 255, 0x00, 0xff, 0x00, 255, 0x00, 0x00, 0xff, 255, 0xff, 0xff, 0xff, 255]);

    function makeImageCanvas(inputData, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const data = new ImageData(inputData, width, height);
        ctx.putImageData(data, 0, 0);
        return canvas;
    }

    function makeImagePng(inputData, width, height) {
        const canvas = makeImageCanvas(inputData, width, height);
        const url = canvas.toDataURL();
        const data = url.split(",")[1];
        return Base64.decode(data);
    }

    describe('viewport handling', function () {
        let display;
        beforeEach(function () {
            display = new Display(document.createElement('canvas'));
            display.clipViewport = true;
            display.resize(5, 5);
            display.viewportChangeSize(3, 3);
            display.viewportChangePos(1, 1);
        });

        test('should take viewport location into consideration when drawing images', function () {
            display.resize(4, 4);
            display.viewportChangeSize(2, 2);
            display.drawImage(makeImageCanvas(basicData, 4, 1), 1, 1);
            display.flip();

            const expected = new Uint8Array(16);
            for (let i = 0; i < 8; i++) { expected[i] = basicData[i]; }
            for (let i = 8; i < 16; i++) { expected[i] = 0; }
            expect(display).toHaveDisplayed(expected);
        });

        test('should resize the target canvas when resizing the viewport', function () {
            display.viewportChangeSize(2, 2);
            expect(display._target.width).toBe(2);
            expect(display._target.height).toBe(2);
        });

        test('should move the viewport if necessary', function () {
            display.viewportChangeSize(5, 5);
            expect(display.absX(0)).toBe(0);
            expect(display.absY(0)).toBe(0);
            expect(display._target.width).toBe(5);
            expect(display._target.height).toBe(5);
        });

        test('should limit the viewport to the framebuffer size', function () {
            display.viewportChangeSize(6, 6);
            expect(display._target.width).toBe(5);
            expect(display._target.height).toBe(5);
        });

        test('should redraw when moving the viewport', function () {
            const flipSpy = spyOn(display, 'flip');
            display.viewportChangePos(-1, 1);
            expect(flipSpy).toHaveBeenCalledTimes(1);
        });

        test('should redraw when resizing the viewport', function () {
            const flipSpy = spyOn(display, 'flip');
            display.viewportChangeSize(2, 2);
            expect(flipSpy).toHaveBeenCalledTimes(1);
        });

        test('should show the entire framebuffer when disabling the viewport', function () {
            display.clipViewport = false;
            expect(display.absX(0)).toBe(0);
            expect(display.absY(0)).toBe(0);
            expect(display._target.width).toBe(5);
            expect(display._target.height).toBe(5);
        });

        test('should ignore viewport changes when the viewport is disabled', function () {
            display.clipViewport = false;
            display.viewportChangeSize(2, 2);
            display.viewportChangePos(1, 1);
            expect(display.absX(0)).toBe(0);
            expect(display.absY(0)).toBe(0);
            expect(display._target.width).toBe(5);
            expect(display._target.height).toBe(5);
        });

        test('should show the entire framebuffer just after enabling the viewport', function () {
            display.clipViewport = false;
            display.clipViewport = true;
            expect(display.absX(0)).toBe(0);
            expect(display.absY(0)).toBe(0);
            expect(display._target.width).toBe(5);
            expect(display._target.height).toBe(5);
        });
    });

    describe('resizing', function () {
        let display;
        beforeEach(function () {
            display = new Display(document.createElement('canvas'));
            display.clipViewport = false;
            display.resize(4, 4);
        });

        test('should change the size of the logical canvas', function () {
            display.resize(5, 7);
            expect(display._fbWidth).toBe(5);
            expect(display._fbHeight).toBe(7);
        });

        test('should keep the framebuffer data', function () {
            display.fillRect(0, 0, 4, 4, [0xff, 0, 0]);
            display.resize(2, 2);
            display.flip();
            const expected = [];
            for (let i = 0; i < 4 * 2*2; i += 4) {
                expected[i] = 0xff;
                expected[i+1] = expected[i+2] = 0;
                expected[i+3] = 0xff;
            }
            expect(display).toHaveDisplayed(new Uint8Array(expected));
        });

        describe('viewport', function () {
            beforeEach(function () {
                display.clipViewport = true;
                display.viewportChangeSize(3, 3);
                display.viewportChangePos(1, 1);
            });

            test('should keep the viewport position and size if possible', function () {
                display.resize(6, 6);
                expect(display.absX(0)).toBe(1);
                expect(display.absY(0)).toBe(1);
                expect(display._target.width).toBe(3);
                expect(display._target.height).toBe(3);
            });

            test('should move the viewport if necessary', function () {
                display.resize(3, 3);
                expect(display.absX(0)).toBe(0);
                expect(display.absY(0)).toBe(0);
                expect(display._target.width).toBe(3);
                expect(display._target.height).toBe(3);
            });

            test('should shrink the viewport if necessary', function () {
                display.resize(2, 2);
                expect(display.absX(0)).toBe(0);
                expect(display.absY(0)).toBe(0);
                expect(display._target.width).toBe(2);
                expect(display._target.height).toBe(2);
            });
        });
    });

    // Skip rescaling tests: @napi-rs/canvas elements cannot be appended to happy-dom's document.body
    describe.skip('rescaling', function () {
        let display;
        let canvas;

        beforeEach(function () {
            canvas = document.createElement('canvas');
            display = new Display(canvas);
            display.clipViewport = true;
            display.resize(4, 4);
            display.viewportChangeSize(3, 3);
            display.viewportChangePos(1, 1);
            document.body.appendChild(canvas);
        });

        afterEach(function () {
            document.body.removeChild(canvas);
        });

        test('should not change the bitmap size of the canvas', function () {
            display.scale = 2.0;
            expect(canvas.width).toBe(3);
            expect(canvas.height).toBe(3);
        });

        test('should change the effective rendered size of the canvas', function () {
            display.scale = 2.0;
            expect(canvas.clientWidth).toBe(6);
            expect(canvas.clientHeight).toBe(6);
        });

        test('should not change when resizing', function () {
            display.scale = 2.0;
            display.resize(5, 5);
            expect(display.scale).toBe(2.0);
            expect(canvas.width).toBe(3);
            expect(canvas.height).toBe(3);
            expect(canvas.clientWidth).toBe(6);
            expect(canvas.clientHeight).toBe(6);
        });
    });

    // Skip autoscaling tests: @napi-rs/canvas elements cannot be appended to happy-dom's document.body
    describe.skip('autoscaling', function () {
        let display;
        let canvas;

        beforeEach(function () {
            canvas = document.createElement('canvas');
            display = new Display(canvas);
            display.clipViewport = true;
            display.resize(4, 3);
            display.viewportChangeSize(4, 3);
            document.body.appendChild(canvas);
        });

        afterEach(function () {
            document.body.removeChild(canvas);
        });

        test('should preserve aspect ratio while autoscaling', function () {
            display.autoscale(16, 9);
            expect(canvas.clientWidth / canvas.clientHeight).toBe(4 / 3);
        });

        test('should use width to determine scale when the current aspect ratio is wider than the target', function () {
            display.autoscale(9, 16);
            expect(display.absX(9)).toBe(4);
            expect(display.absY(18)).toBe(8);
            expect(canvas.clientWidth).toBe(9);
            expect(canvas.clientHeight).toBe(7); // round 9 / (4 / 3)
        });

        test('should use height to determine scale when the current aspect ratio is taller than the target', function () {
            display.autoscale(16, 9);
            expect(display.absX(9)).toBe(3);
            expect(display.absY(18)).toBe(6);
            expect(canvas.clientWidth).toBe(12);  // 16 * (4 / 3)
            expect(canvas.clientHeight).toBe(9);

        });

        test('should not change the bitmap size of the canvas', function () {
            display.autoscale(16, 9);
            expect(canvas.width).toBe(4);
            expect(canvas.height).toBe(3);
        });
    });

    describe('drawing', function () {

        // TODO(directxman12): improve the tests for each of the drawing functions to cover more than just the
        //                     basic cases
        let display;
        beforeEach(function () {
            display = new Display(document.createElement('canvas'));
            display.resize(4, 4);
        });

        test('should not draw directly on the target canvas', function () {
            display.fillRect(0, 0, 4, 4, [0xff, 0, 0]);
            display.flip();
            display.fillRect(0, 0, 4, 4, [0, 0xff, 0]);
            const expected = [];
            for (let i = 0; i < 4 * display._fbWidth * display._fbHeight; i += 4) {
                expected[i] = 0xff;
                expected[i+1] = expected[i+2] = 0;
                expected[i+3] = 0xff;
            }
            expect(display).toHaveDisplayed(new Uint8Array(expected));
        });

        test('should support filling a rectangle with particular color via #fillRect', function () {
            display.fillRect(0, 0, 4, 4, [0, 0xff, 0]);
            display.fillRect(0, 0, 2, 2, [0, 0, 0xff]);
            display.fillRect(2, 2, 2, 2, [0, 0, 0xff]);
            display.flip();
            expect(display).toHaveDisplayed(checkedData);
        });

        test('should support copying an portion of the canvas via #copyImage', function () {
            display.fillRect(0, 0, 4, 4, [0, 0xff, 0]);
            display.fillRect(0, 0, 2, 2, [0, 0, 0xff]);
            display.copyImage(0, 0, 2, 2, 2, 2);
            display.flip();
            expect(display).toHaveDisplayed(checkedData);
        });

        // Skip: imageRect uses Image() to load PNG data, which is not available in @napi-rs/canvas
        test.skip('should support drawing images via #imageRect', async function () {
            display.imageRect(0, 0, 4, 4, "image/png", makeImagePng(checkedData, 4, 4));
            display.flip();
            await display.flush();
            expect(display).toHaveDisplayed(checkedData);
        });

        test('should support blit images with true color via #blitImage', function () {
            display.blitImage(0, 0, 4, 4, checkedData, 0);
            display.flip();
            expect(display).toHaveDisplayed(checkedData);
        });

        test('should support drawing an image object via #drawImage', function () {
            const img = makeImageCanvas(checkedData, 4, 4);
            display.drawImage(img, 0, 0);
            display.flip();
            expect(display).toHaveDisplayed(checkedData);
        });
    });

    describe('the render queue processor', function () {
        let display;
        beforeEach(function () {
            display = new Display(document.createElement('canvas'));
            display.resize(4, 4);
            spyOn(display, '_scanRenderQ');
        });

        test('should try to process an item when it is pushed on, if nothing else is on the queue', function () {
            display._renderQPush({ type: 'noop' });  // does nothing
            expect(display._scanRenderQ).toHaveBeenCalledTimes(1);
        });

        test('should not try to process an item when it is pushed on if we are waiting for other items', function () {
            display._renderQ.length = 2;
            display._renderQPush({ type: 'noop' });
            expect(display._scanRenderQ).not.toHaveBeenCalled();
        });

        test('should wait until an image is loaded to attempt to draw it and the rest of the queue', function () {
            const addEventListenerSpy = mock(() => {});
            const img = { complete: false, width: 4, height: 4, addEventListener: addEventListenerSpy };
            display._renderQ = [{ type: 'img', x: 3, y: 4, width: 4, height: 4, img: img },
                                { type: 'fill', x: 1, y: 2, width: 3, height: 4, color: 5 }];
            // Use mock to prevent actual calls (which would fail with @napi-rs/canvas)
            display.drawImage = mock(() => {});
            display.fillRect = mock(() => {});

            display._scanRenderQ();
            expect(display.drawImage).not.toHaveBeenCalled();
            expect(display.fillRect).not.toHaveBeenCalled();
            expect(addEventListenerSpy).toHaveBeenCalledTimes(1);

            display._renderQ[0].img.complete = true;
            display._scanRenderQ();
            expect(display.drawImage).toHaveBeenCalledTimes(1);
            expect(display.fillRect).toHaveBeenCalledTimes(1);
            expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
        });

        test('should resolve promise when queue is flushed', async function () {
            display.fillRect(0, 0, 4, 4, [0, 0xff, 0]);
            let promise = display.flush();
            expect(promise).toBeInstanceOf(Promise);
            await promise;
        });

        test('should draw a blit image on type "blit"', function () {
            // Use mock to prevent actual blitImage call (fails with invalid data on @napi-rs/canvas)
            display.blitImage = mock(() => {});
            display._renderQPush({ type: 'blit', x: 3, y: 4, width: 5, height: 6, data: [7, 8, 9] });
            expect(display.blitImage).toHaveBeenCalledTimes(1);
            expect(display.blitImage).toHaveBeenCalledWith(3, 4, 5, 6, [7, 8, 9], 0, true);
        });

        test('should copy a region on type "copy"', function () {
            const copySpy = spyOn(display, 'copyImage');
            display._renderQPush({ type: 'copy', x: 3, y: 4, width: 5, height: 6, oldX: 7, oldY: 8 });
            expect(copySpy).toHaveBeenCalledTimes(1);
            expect(copySpy).toHaveBeenCalledWith(7, 8, 3, 4, 5, 6, true);
        });

        test('should fill a rect with a given color on type "fill"', function () {
            const fillSpy = spyOn(display, 'fillRect');
            display._renderQPush({ type: 'fill', x: 3, y: 4, width: 5, height: 6, color: [7, 8, 9]});
            expect(fillSpy).toHaveBeenCalledTimes(1);
            expect(fillSpy).toHaveBeenCalledWith(3, 4, 5, 6, [7, 8, 9], true);
        });

        test('should draw an image from an image object on type "img" (if complete)', function () {
            // Use mock to prevent actual drawImage call (fails with plain objects on @napi-rs/canvas)
            display.drawImage = mock(() => {});
            display._renderQPush({ type: 'img', x: 3, y: 4, img: { complete: true } });
            expect(display.drawImage).toHaveBeenCalledTimes(1);
            expect(display.drawImage).toHaveBeenCalledWith({ complete: true }, 3, 4);
        });
    });
});
