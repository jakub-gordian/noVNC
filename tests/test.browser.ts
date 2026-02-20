import { describe, expect, test, beforeEach, afterEach } from "bun:test";

import { isMac, isWindows, isIOS, isAndroid, isChromeOS,
         isSafari, isFirefox, isChrome, isChromium, isOpera, isEdge,
         isGecko, isWebKit, isBlink } from '../core/util/browser.ts';

describe('OS detection', function () {
    let origNavigator: PropertyDescriptor | undefined;
    beforeEach(function () {
        // window.navigator is a protected read-only property in many
        // environments, so we need to redefine it whilst running these
        // tests.
        origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");

        Object.defineProperty(window, "navigator", {value: {}});
    });

    afterEach(function () {
        Object.defineProperty(window, "navigator", origNavigator!);
    });

    test('should handle macOS', function () {
        const platforms = [
            "MacIntel",
            "MacPPC",
        ];

        (navigator as any).userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 12_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15";
        platforms.forEach((platform) => {
            (navigator as any).platform = platform;
            expect(isMac()).toBe(true);
            expect(isWindows()).toBe(false);
            expect(isIOS()).toBe(false);
            expect(isAndroid()).toBe(false);
            expect(isChromeOS()).toBe(false);
        });
    });

    test('should handle Windows', function () {
        const platforms = [
            "Win32",
            "Win64",
        ];

        (navigator as any).userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36";
        platforms.forEach((platform) => {
            (navigator as any).platform = platform;
            expect(isMac()).toBe(false);
            expect(isWindows()).toBe(true);
            expect(isIOS()).toBe(false);
            expect(isAndroid()).toBe(false);
            expect(isChromeOS()).toBe(false);
        });
    });

    test('should handle iOS', function () {
        const platforms = [
            "iPhone",
            "iPod",
            "iPad",
        ];

        (navigator as any).userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Mobile/15E148 Safari/604.1";
        platforms.forEach((platform) => {
            (navigator as any).platform = platform;
            expect(isMac()).toBe(false);
            expect(isWindows()).toBe(false);
            expect(isIOS()).toBe(true);
            expect(isAndroid()).toBe(false);
            expect(isChromeOS()).toBe(false);
        });
    });

    test('should handle Android', function () {
        let userAgents = [
            "Mozilla/5.0 (Linux; Android 13; SM-G960U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Mobile Safari/537.36",
            "Mozilla/5.0 (Android 13; Mobile; LG-M255; rv:108.0) Gecko/108.0 Firefox/108.0",
        ];

        (navigator as any).platform = "Linux x86_64";
        userAgents.forEach((ua) => {
            (navigator as any).userAgent = ua;
            expect(isMac()).toBe(false);
            expect(isWindows()).toBe(false);
            expect(isIOS()).toBe(false);
            expect(isAndroid()).toBe(true);
            expect(isChromeOS()).toBe(false);
        });
    });

    test('should handle ChromeOS', function () {
        let userAgents = [
            "Mozilla/5.0 (X11; CrOS x86_64 15183.59.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.75 Safari/537.36",
            "Mozilla/5.0 (X11; CrOS aarch64 15183.59.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.75 Safari/537.36",
        ];

        (navigator as any).platform = "Linux x86_64";
        userAgents.forEach((ua) => {
            (navigator as any).userAgent = ua;
            expect(isMac()).toBe(false);
            expect(isWindows()).toBe(false);
            expect(isIOS()).toBe(false);
            expect(isAndroid()).toBe(false);
            expect(isChromeOS()).toBe(true);
        });
    });
});

describe('Browser detection', function () {
    let origNavigator: PropertyDescriptor | undefined;
    beforeEach(function () {
        // window.navigator is a protected read-only property in many
        // environments, so we need to redefine it whilst running these
        // tests.
        origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");

        Object.defineProperty(window, "navigator", {value: {}});
    });

    afterEach(function () {
        Object.defineProperty(window, "navigator", origNavigator!);
    });

    test('should handle Chrome', function () {
        (navigator as any).userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36";

        expect(isSafari()).toBe(false);
        expect(isFirefox()).toBe(false);
        expect(isChrome()).toBe(true);
        expect(isChromium()).toBe(false);
        expect(isOpera()).toBe(false);
        expect(isEdge()).toBe(false);

        expect(isGecko()).toBe(false);
        expect(isWebKit()).toBe(false);
        expect(isBlink()).toBe(true);
    });

    test('should handle Chromium', function () {
        (navigator as any).userAgent = "Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Raspbian Chromium/74.0.3729.157 Chrome/74.0.3729.157 Safari/537.36";

        expect(isSafari()).toBe(false);
        expect(isFirefox()).toBe(false);
        expect(isChrome()).toBe(false);
        expect(isChromium()).toBe(true);
        expect(isOpera()).toBe(false);
        expect(isEdge()).toBe(false);

        expect(isGecko()).toBe(false);
        expect(isWebKit()).toBe(false);
        expect(isBlink()).toBe(true);
    });

    test('should handle Firefox', function () {
        (navigator as any).userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:105.0) Gecko/20100101 Firefox/105.0";

        expect(isSafari()).toBe(false);
        expect(isFirefox()).toBe(true);
        expect(isChrome()).toBe(false);
        expect(isChromium()).toBe(false);
        expect(isOpera()).toBe(false);
        expect(isEdge()).toBe(false);

        expect(isGecko()).toBe(true);
        expect(isWebKit()).toBe(false);
        expect(isBlink()).toBe(false);
    });

    test('should handle Seamonkey', function () {
        (navigator as any).userAgent = "Mozilla/5.0 (Windows NT 6.1; rv:36.0) Gecko/20100101 Firefox/36.0 Seamonkey/2.33.1";

        expect(isSafari()).toBe(false);
        expect(isFirefox()).toBe(false);
        expect(isChrome()).toBe(false);
        expect(isChromium()).toBe(false);
        expect(isOpera()).toBe(false);
        expect(isEdge()).toBe(false);

        expect(isGecko()).toBe(true);
        expect(isWebKit()).toBe(false);
        expect(isBlink()).toBe(false);
    });

    test('should handle Safari', function () {
        (navigator as any).userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 12_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15";

        expect(isSafari()).toBe(true);
        expect(isFirefox()).toBe(false);
        expect(isChrome()).toBe(false);
        expect(isChromium()).toBe(false);
        expect(isOpera()).toBe(false);
        expect(isEdge()).toBe(false);

        expect(isGecko()).toBe(false);
        expect(isWebKit()).toBe(true);
        expect(isBlink()).toBe(false);
    });

    test('should handle Edge', function () {
        (navigator as any).userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36 Edg/106.0.1370.34";

        expect(isSafari()).toBe(false);
        expect(isFirefox()).toBe(false);
        expect(isChrome()).toBe(false);
        expect(isChromium()).toBe(false);
        expect(isOpera()).toBe(false);
        expect(isEdge()).toBe(true);

        expect(isGecko()).toBe(false);
        expect(isWebKit()).toBe(false);
        expect(isBlink()).toBe(true);
    });

    test('should handle Opera', function () {
        (navigator as any).userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36 OPR/91.0.4516.20";

        expect(isSafari()).toBe(false);
        expect(isFirefox()).toBe(false);
        expect(isChrome()).toBe(false);
        expect(isChromium()).toBe(false);
        expect(isOpera()).toBe(true);
        expect(isEdge()).toBe(false);

        expect(isGecko()).toBe(false);
        expect(isWebKit()).toBe(false);
        expect(isBlink()).toBe(true);
    });

    test('should handle Epiphany', function () {
        (navigator as any).userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.0 Safari/605.1.15 Epiphany/605.1.15";

        expect(isSafari()).toBe(false);
        expect(isFirefox()).toBe(false);
        expect(isChrome()).toBe(false);
        expect(isChromium()).toBe(false);
        expect(isOpera()).toBe(false);
        expect(isEdge()).toBe(false);

        expect(isGecko()).toBe(false);
        expect(isWebKit()).toBe(true);
        expect(isBlink()).toBe(false);
    });
});
