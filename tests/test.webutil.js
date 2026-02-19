import { describe, expect, test, beforeEach, afterEach, beforeAll, afterAll, mock, spyOn } from "bun:test";

import * as WebUtil from '../app/webutil.js';

describe('WebUtil', function () {
    describe('config variables', function () {
        let origHref;
        beforeEach(function () {
            origHref = location.href;
        });
        afterEach(function () {
            window.happyDOM.setURL(origHref);
        });

        test('should parse query string variables', function () {
            window.happyDOM.setURL("http://example.com/test?myvar=myval");
            expect(WebUtil.getConfigVar("myvar")).toBe("myval");
        });
        test('should return default value when no query match', function () {
            window.happyDOM.setURL("http://example.com/test?myvar=myval");
            expect(WebUtil.getConfigVar("other", "def")).toBe("def");
        });
        test('should handle no query match and no default value', function () {
            window.happyDOM.setURL("http://example.com/test?myvar=myval");
            expect(WebUtil.getConfigVar("other")).toBe(null);
        });
        test('should parse fragment variables', function () {
            window.happyDOM.setURL("http://example.com/test#myvar=myval");
            expect(WebUtil.getConfigVar("myvar")).toBe("myval");
        });
        test('should return default value when no fragment match', function () {
            window.happyDOM.setURL("http://example.com/test#myvar=myval");
            expect(WebUtil.getConfigVar("other", "def")).toBe("def");
        });
        test('should handle no fragment match and no default value', function () {
            window.happyDOM.setURL("http://example.com/test#myvar=myval");
            expect(WebUtil.getConfigVar("other")).toBe(null);
        });
        test('should handle both query and fragment', function () {
            window.happyDOM.setURL("http://example.com/test?myquery=1#myhash=2");
            expect(WebUtil.getConfigVar("myquery")).toBe("1");
            expect(WebUtil.getConfigVar("myhash")).toBe("2");
        });
        test('should prioritize fragment if both provide same var', function () {
            window.happyDOM.setURL("http://example.com/test?myvar=1#myvar=2");
            expect(WebUtil.getConfigVar("myvar")).toBe("2");
        });
    });

    describe('cookies', function () {
        // TODO
    });

    describe('settings', function () {

        describe('localStorage', function () {
            let chrome;
            beforeAll(function () {
                chrome = window.chrome;
                window.chrome = null;
            });
            afterAll(function () {
                window.chrome = chrome;
            });

            let origLocalStorage;
            beforeEach(function () {
                origLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");

                Object.defineProperty(window, "localStorage", {value: {}});

                window.localStorage.setItem = mock(() => {});
                window.localStorage.getItem = mock(() => null);
                window.localStorage.removeItem = mock(() => {});

                return WebUtil.initSettings();
            });
            afterEach(function () {
                Object.defineProperty(window, "localStorage", origLocalStorage);
            });

            describe('writeSetting', function () {
                test('should save the setting value to local storage', function () {
                    WebUtil.writeSetting('test', 'value');
                    expect(window.localStorage.setItem).toHaveBeenCalledWith('test', 'value');
                    expect(WebUtil.readSetting('test')).toBe('value');
                });

                test('should not crash when local storage save fails', function () {
                    window.localStorage.setItem = mock(() => { throw new DOMException(); });
                    expect(() => WebUtil.writeSetting('test', 'value')).not.toThrow();
                });
            });

            describe('setSetting', function () {
                test('should update the setting but not save to local storage', function () {
                    WebUtil.setSetting('test', 'value');
                    expect(window.localStorage.setItem).not.toHaveBeenCalled();
                    expect(WebUtil.readSetting('test')).toBe('value');
                });
            });

            describe('readSetting', function () {
                test('should read the setting value from local storage', function () {
                    window.localStorage.getItem = mock(() => 'value');
                    // Re-init to pick up the new mock
                    return WebUtil.initSettings().then(() => {
                        expect(WebUtil.readSetting('test')).toBe('value');
                    });
                });

                test('should return the default value when not in local storage', function () {
                    expect(WebUtil.readSetting('test', 'default')).toBe('default');
                });

                test('should return the cached value even if local storage changed', function () {
                    window.localStorage.getItem = mock(() => 'value');
                    return WebUtil.initSettings().then(() => {
                        expect(WebUtil.readSetting('test')).toBe('value');
                        window.localStorage.getItem = mock(() => 'something else');
                        expect(WebUtil.readSetting('test')).toBe('value');
                    });
                });

                test('should cache the value even if it is not initially in local storage', function () {
                    expect(WebUtil.readSetting('test')).toBeNull();
                    window.localStorage.getItem = mock(() => 'value');
                    expect(WebUtil.readSetting('test')).toBeNull();
                });

                test('should return the default value always if the first read was not in local storage', function () {
                    expect(WebUtil.readSetting('test', 'default')).toBe('default');
                    window.localStorage.getItem = mock(() => 'value');
                    expect(WebUtil.readSetting('test', 'another default')).toBe('another default');
                });

                test('should return the last local written value', function () {
                    window.localStorage.getItem = mock(() => 'value');
                    return WebUtil.initSettings().then(() => {
                        expect(WebUtil.readSetting('test')).toBe('value');
                        WebUtil.writeSetting('test', 'something else');
                        expect(WebUtil.readSetting('test')).toBe('something else');
                    });
                });

                test('should not crash when local storage read fails', function () {
                    window.localStorage.getItem = mock(() => { throw new DOMException(); });
                    return WebUtil.initSettings().then(() => {
                        expect(() => WebUtil.readSetting('test')).not.toThrow();
                    });
                });
            });

            // this doesn't appear to be used anywhere
            describe('eraseSetting', function () {
                test('should remove the setting from local storage', function () {
                    WebUtil.eraseSetting('test');
                    expect(window.localStorage.removeItem).toHaveBeenCalledWith('test');
                });

                test('should not crash when local storage remove fails', function () {
                    window.localStorage.removeItem = mock(() => { throw new DOMException(); });
                    expect(() => WebUtil.eraseSetting('test')).not.toThrow();
                });
            });
        });

        describe('chrome.storage', function () {
            let chrome;
            let settings = {};
            beforeAll(function () {
                chrome = window.chrome;
                window.chrome = {
                    storage: {
                        sync: {
                            get(cb) { cb(settings); },
                            set() {},
                            remove() {}
                        }
                    }
                };
            });
            afterAll(function () {
                window.chrome = chrome;
            });

            let setSpy, removeSpy;
            beforeEach(function () {
                settings = {};
                setSpy = spyOn(window.chrome.storage.sync, 'set');
                removeSpy = spyOn(window.chrome.storage.sync, 'remove');
                return WebUtil.initSettings();
            });
            afterEach(function () {
                setSpy.mockRestore();
                removeSpy.mockRestore();
            });

            describe('writeSetting', function () {
                test('should save the setting value to chrome storage', function () {
                    WebUtil.writeSetting('test', 'value');
                    expect(setSpy).toHaveBeenCalledTimes(1);
                    const calledArg = setSpy.mock.calls[0][0];
                    expect(calledArg).toEqual(expect.objectContaining({ test: 'value' }));
                    expect(WebUtil.readSetting('test')).toBe('value');
                });
            });

            describe('setSetting', function () {
                test('should update the setting but not save to chrome storage', function () {
                    WebUtil.setSetting('test', 'value');
                    expect(setSpy).not.toHaveBeenCalled();
                    expect(WebUtil.readSetting('test')).toBe('value');
                });
            });

            describe('readSetting', function () {
                test('should read the setting value from chrome storage', function () {
                    settings.test = 'value';
                    return WebUtil.initSettings().then(() => {
                        expect(WebUtil.readSetting('test')).toBe('value');
                    });
                });

                test('should return the default value when not in chrome storage', function () {
                    expect(WebUtil.readSetting('test', 'default')).toBe('default');
                });

                test('should return the last local written value', function () {
                    settings.test = 'value';
                    return WebUtil.initSettings().then(() => {
                        expect(WebUtil.readSetting('test')).toBe('value');
                        WebUtil.writeSetting('test', 'something else');
                        expect(WebUtil.readSetting('test')).toBe('something else');
                    });
                });
            });

            // this doesn't appear to be used anywhere
            describe('eraseSetting', function () {
                test('should remove the setting from chrome storage', function () {
                    WebUtil.eraseSetting('test');
                    expect(removeSpy).toHaveBeenCalledWith('test');
                });
            });
        });
    });
});
