/* eslint-disable no-console */
import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";

import * as Log from '../core/util/logging.js';
import { encodeUTF8, decodeUTF8 } from '../core/util/strings.js';

describe('Utils', function () {
    describe('logging functions', function () {
        let logSpy, debugSpy, warnSpy, errorSpy, infoSpy;

        beforeEach(function () {
            logSpy = spyOn(console, 'log');
            debugSpy = spyOn(console, 'debug');
            warnSpy = spyOn(console, 'warn');
            errorSpy = spyOn(console, 'error');
            infoSpy = spyOn(console, 'info');
        });

        afterEach(function () {
            logSpy.mockRestore();
            debugSpy.mockRestore();
            warnSpy.mockRestore();
            errorSpy.mockRestore();
            infoSpy.mockRestore();
            Log.initLogging();
        });

        test('should use noop for levels lower than the min level', function () {
            Log.initLogging('warn');
            Log.Debug('hi');
            Log.Info('hello');
            expect(console.log).not.toHaveBeenCalled();
        });

        test('should use console.debug for Debug', function () {
            Log.initLogging('debug');
            Log.Debug('dbg');
            expect(console.debug).toHaveBeenCalledWith('dbg');
        });

        test('should use console.info for Info', function () {
            Log.initLogging('debug');
            Log.Info('inf');
            expect(console.info).toHaveBeenCalledWith('inf');
        });

        test('should use console.warn for Warn', function () {
            Log.initLogging('warn');
            Log.Warn('wrn');
            expect(console.warn).toHaveBeenCalled();
            expect(console.warn).toHaveBeenCalledWith('wrn');
        });

        test('should use console.error for Error', function () {
            Log.initLogging('error');
            Log.Error('err');
            expect(console.error).toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledWith('err');
        });
    });

    describe('string functions', function () {
        test('should decode UTF-8 to DOMString correctly', function () {
            const utf8string = '\xd0\x9f';
            const domstring = decodeUTF8(utf8string);
            expect(domstring).toBe("\u041f");
        });

        test('should encode DOMString to UTF-8 correctly', function () {
            const domstring = "\u00e5\u00e4\u00f6a";
            const utf8string = encodeUTF8(domstring);
            expect(utf8string).toBe('\xc3\xa5\xc3\xa4\xc3\xb6\x61');
        });

        test('should allow Latin-1 strings if allowLatin1 is set when decoding', function () {
            const latin1string = '\xe5\xe4\xf6';
            expect(() => decodeUTF8(latin1string)).toThrow();
            expect(decodeUTF8(latin1string, true)).toBe('\u00e5\u00e4\u00f6');
        });
    });

    // TODO(directxman12): test the conf_default and conf_defaults methods
    // TODO(directxman12): test the event methods (addEvent, removeEvent, stopEvent)
    // TODO(directxman12): figure out a good way to test getPosition and getEventPosition
    // TODO(directxman12): figure out how to test the browser detection functions properly
    //                     (we can't really test them against the browsers, except for Gecko
    //                     via PhantomJS, the default test driver)
});
/* eslint-enable no-console */
