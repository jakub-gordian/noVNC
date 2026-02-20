import { describe, expect, test, beforeEach, afterEach, mock, spyOn, jest } from "bun:test";

import Keyboard from '../core/input/keyboard.ts';

// Helper: check that a mock was called with specific leading args
// (ignoring trailing args like numLock/capsLock)
function expectCalledWith(mockFn, ...args) {
    const calls = mockFn.mock.calls;
    const found = calls.some(call =>
        args.every((arg, i) => call[i] === arg)
    );
    if (!found) {
        throw new Error(
            `Expected mock to have been called with ${JSON.stringify(args)}, ` +
            `but calls were: ${JSON.stringify(calls)}`
        );
    }
}

describe('Key event handling', function () {

    // The real KeyboardEvent constructor might not work everywhere we
    // want to run these tests
    function keyevent(typeArg, KeyboardEventInit) {
        const e = { type: typeArg };
        for (let key in KeyboardEventInit) {
            e[key] = KeyboardEventInit[key];
        }
        e.stopPropagation = mock(() => {});
        e.preventDefault = mock(() => {});
        e.getModifierState = function (key) {
            return e[key];
        };

        return e;
    }

    describe('Decode keyboard events', function () {
        test('should decode keydown events', function () {
            return new Promise((resolve) => {
                const kbd = new Keyboard(document);
                kbd.onkeyevent = (keysym, code, down) => {
                    expect(keysym).toBe(0x61);
                    expect(code).toBe('KeyA');
                    expect(down).toBe(true);
                    resolve();
                };
                kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'a'}));
            });
        });
        test('should decode keyup events', function () {
            return new Promise((resolve) => {
                let calls = 0;
                const kbd = new Keyboard(document);
                kbd.onkeyevent = (keysym, code, down) => {
                    expect(keysym).toBe(0x61);
                    expect(code).toBe('KeyA');
                    if (calls++ === 1) {
                        expect(down).toBe(false);
                        resolve();
                    }
                };
                kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'a'}));
                kbd._handleKeyUp(keyevent('keyup', {code: 'KeyA', key: 'a'}));
            });
        });
    });

    describe('Fake keyup', function () {
        test('should fake keyup events for virtual keyboards', function () {
            return new Promise((resolve) => {
                let count = 0;
                const kbd = new Keyboard(document);
                kbd.onkeyevent = (keysym, code, down) => {
                    switch (count++) {
                        case 0:
                            expect(keysym).toBe(0x61);
                            expect(code).toBe('Unidentified');
                            expect(down).toBe(true);
                            break;
                        case 1:
                            expect(keysym).toBe(0x61);
                            expect(code).toBe('Unidentified');
                            expect(down).toBe(false);
                            resolve();
                    }
                };
                kbd._handleKeyDown(keyevent('keydown', {code: 'Unidentified', key: 'a'}));
            });
        });
    });

    describe('Track key state', function () {
        test('should send release using the same keysym as the press', function () {
            return new Promise((resolve) => {
                const kbd = new Keyboard(document);
                kbd.onkeyevent = (keysym, code, down) => {
                    expect(keysym).toBe(0x61);
                    expect(code).toBe('KeyA');
                    if (!down) {
                        resolve();
                    }
                };
                kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'a'}));
                kbd._handleKeyUp(keyevent('keyup', {code: 'KeyA', key: 'b'}));
            });
        });
        test('should send the same keysym for multiple presses', function () {
            let count = 0;
            const kbd = new Keyboard(document);
            kbd.onkeyevent = (keysym, code, down) => {
                expect(keysym).toBe(0x61);
                expect(code).toBe('KeyA');
                expect(down).toBe(true);
                count++;
            };
            kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'a'}));
            kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'b'}));
            expect(count).toBe(2);
        });
        test('should do nothing on keyup events if no keys are down', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyUp(keyevent('keyup', {code: 'KeyA', key: 'a'}));
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
        });

        describe('Legacy events', function () {
            test('should track keys using keyCode if no code', function () {
                return new Promise((resolve) => {
                    const kbd = new Keyboard(document);
                    kbd.onkeyevent = (keysym, code, down) => {
                        expect(keysym).toBe(0x61);
                        expect(code).toBe('Platform65');
                        if (!down) {
                            resolve();
                        }
                    };
                    kbd._handleKeyDown(keyevent('keydown', {keyCode: 65, key: 'a'}));
                    kbd._handleKeyUp(keyevent('keyup', {keyCode: 65, key: 'b'}));
                });
            });
            test('should ignore compositing code', function () {
                const kbd = new Keyboard(document);
                kbd.onkeyevent = (keysym, code, down) => {
                    expect(keysym).toBe(0x61);
                    expect(code).toBe('Unidentified');
                };
                kbd._handleKeyDown(keyevent('keydown', {keyCode: 229, key: 'a'}));
            });
            test('should track keys using keyIdentifier if no code', function () {
                return new Promise((resolve) => {
                    const kbd = new Keyboard(document);
                    kbd.onkeyevent = (keysym, code, down) => {
                        expect(keysym).toBe(0x61);
                        expect(code).toBe('Platform65');
                        if (!down) {
                            resolve();
                        }
                    };
                    kbd._handleKeyDown(keyevent('keydown', {keyIdentifier: 'U+0041', key: 'a'}));
                    kbd._handleKeyUp(keyevent('keyup', {keyIdentifier: 'U+0041', key: 'b'}));
                });
            });
        });
    });

    describe('Shuffle modifiers on macOS', function () {
        let origNavigator;
        beforeEach(function () {
            origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");
            Object.defineProperty(window, "navigator", {value: {}});
            window.navigator.platform = "Mac x86_64";
        });
        afterEach(function () {
            Object.defineProperty(window, "navigator", origNavigator);
        });

        test('should change Alt to AltGraph', function () {
            let count = 0;
            const kbd = new Keyboard(document);
            kbd.onkeyevent = (keysym, code, down) => {
                switch (count++) {
                    case 0:
                        expect(keysym).toBe(0xFF7E);
                        expect(code).toBe('AltLeft');
                        break;
                    case 1:
                        expect(keysym).toBe(0xFE03);
                        expect(code).toBe('AltRight');
                        break;
                }
            };
            kbd._handleKeyDown(keyevent('keydown', {code: 'AltLeft', key: 'Alt', location: 1}));
            kbd._handleKeyDown(keyevent('keydown', {code: 'AltRight', key: 'Alt', location: 2}));
            expect(count).toBe(2);
        });
        test('should change left Super to Alt', function () {
            return new Promise((resolve) => {
                const kbd = new Keyboard(document);
                kbd.onkeyevent = (keysym, code, down) => {
                    expect(keysym).toBe(0xFFE9);
                    expect(code).toBe('MetaLeft');
                    resolve();
                };
                kbd._handleKeyDown(keyevent('keydown', {code: 'MetaLeft', key: 'Meta', location: 1}));
            });
        });
        test('should change right Super to left Super', function () {
            return new Promise((resolve) => {
                const kbd = new Keyboard(document);
                kbd.onkeyevent = (keysym, code, down) => {
                    expect(keysym).toBe(0xFFEB);
                    expect(code).toBe('MetaRight');
                    resolve();
                };
                kbd._handleKeyDown(keyevent('keydown', {code: 'MetaRight', key: 'Meta', location: 2}));
            });
        });
    });

    describe('Meta key combination on iOS and macOS', function () {
        let origNavigator;
        beforeEach(function () {
            origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");
            Object.defineProperty(window, "navigator", {value: {}});
        });

        afterEach(function () {
            if (origNavigator !== undefined) {
                Object.defineProperty(window, "navigator", origNavigator);
            }
        });

        test('should send keyup when meta key is pressed on iOS', function () {
            window.navigator.platform = "iPad";
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});

            kbd._handleKeyDown(keyevent('keydown', {code: 'MetaRight', key: 'Meta', location: 2, metaKey: true}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            kbd.onkeyevent.mockClear();

            kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'a', metaKey: true}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expectCalledWith(kbd.onkeyevent, 0x61, "KeyA", true);
            expectCalledWith(kbd.onkeyevent, 0x61, "KeyA", false);
            kbd.onkeyevent.mockClear();

            kbd._handleKeyUp(keyevent('keyup', {code: 'MetaRight', key: 'Meta', location: 2, metaKey: true}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
        });

        test('should send keyup when meta key is pressed on macOS', function () {
            window.navigator.platform = "Mac";
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});

            kbd._handleKeyDown(keyevent('keydown', {code: 'MetaRight', key: 'Meta', location: 2, metaKey: true}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            kbd.onkeyevent.mockClear();

            kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'a', metaKey: true}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expectCalledWith(kbd.onkeyevent, 0x61, "KeyA", true);
            expectCalledWith(kbd.onkeyevent, 0x61, "KeyA", false);
            kbd.onkeyevent.mockClear();

            kbd._handleKeyUp(keyevent('keyup', {code: 'MetaRight', key: 'Meta', location: 2, metaKey: true}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
        });
    });

    describe('Caps Lock on iOS and macOS', function () {
        let origNavigator;
        beforeEach(function () {
            origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");
            Object.defineProperty(window, "navigator", {value: {}});
        });

        afterEach(function () {
            Object.defineProperty(window, "navigator", origNavigator);
        });

        test('should toggle caps lock on key press on iOS', function () {
            window.navigator.platform = "iPad";
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'CapsLock', key: 'CapsLock'}));

            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expect(kbd.onkeyevent.mock.calls[0].slice(0, 3)).toEqual([0xFFE5, "CapsLock", true]);
            expect(kbd.onkeyevent.mock.calls[1].slice(0, 3)).toEqual([0xFFE5, "CapsLock", false]);
        });

        test('should toggle caps lock on key press on mac', function () {
            window.navigator.platform = "Mac";
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'CapsLock', key: 'CapsLock'}));

            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expect(kbd.onkeyevent.mock.calls[0].slice(0, 3)).toEqual([0xFFE5, "CapsLock", true]);
            expect(kbd.onkeyevent.mock.calls[1].slice(0, 3)).toEqual([0xFFE5, "CapsLock", false]);
        });

        test('should toggle caps lock on key release on iOS', function () {
            window.navigator.platform = "iPad";
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyUp(keyevent('keyup', {code: 'CapsLock', key: 'CapsLock'}));

            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expect(kbd.onkeyevent.mock.calls[0].slice(0, 3)).toEqual([0xFFE5, "CapsLock", true]);
            expect(kbd.onkeyevent.mock.calls[1].slice(0, 3)).toEqual([0xFFE5, "CapsLock", false]);
        });

        test('should toggle caps lock on key release on mac', function () {
            window.navigator.platform = "Mac";
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyUp(keyevent('keyup', {code: 'CapsLock', key: 'CapsLock'}));

            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expect(kbd.onkeyevent.mock.calls[0].slice(0, 3)).toEqual([0xFFE5, "CapsLock", true]);
            expect(kbd.onkeyevent.mock.calls[1].slice(0, 3)).toEqual([0xFFE5, "CapsLock", false]);
        });
    });

    describe('Modifier status info', function () {
        let origNavigator;
        beforeEach(function () {
            origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");
            Object.defineProperty(window, "navigator", {value: {}});
        });

        afterEach(function () {
            Object.defineProperty(window, "navigator", origNavigator);
        });

        test('should provide caps lock state', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'A', NumLock: false, CapsLock: true}));

            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expect(kbd.onkeyevent.mock.calls[0]).toEqual([0x41, "KeyA", true, false, true]);
        });

        test('should provide num lock state', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'A', NumLock: true, CapsLock: false}));

            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expect(kbd.onkeyevent.mock.calls[0]).toEqual([0x41, "KeyA", true, true, false]);
        });

        test('should have no num lock state on mac', function () {
            window.navigator.platform = "Mac";
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'A', NumLock: false, CapsLock: true}));

            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expect(kbd.onkeyevent.mock.calls[0]).toEqual([0x41, "KeyA", true, null, true]);
        });
    });

    describe('Japanese IM keys on Windows', function () {
        let origNavigator;
        beforeEach(function () {
            origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");
            Object.defineProperty(window, "navigator", {value: {}});
            window.navigator.platform = "Windows";
        });

        afterEach(function () {
            Object.defineProperty(window, "navigator", origNavigator);
        });

        const keys = { 'Zenkaku': 0xff2a, 'Hankaku': 0xff2a,
                       'Alphanumeric': 0xff30, 'Katakana': 0xff26,
                       'Hiragana': 0xff25, 'Romaji': 0xff24,
                       'KanaMode': 0xff24 };
        for (let [key, keysym] of Object.entries(keys)) {
            test(`should fake key release for ${key} on Windows`, function () {
                let kbd = new Keyboard(document);
                kbd.onkeyevent = mock(() => {});
                kbd._handleKeyDown(keyevent('keydown', {code: 'FakeIM', key: key}));

                expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
                expect(kbd.onkeyevent.mock.calls[0].slice(0, 3)).toEqual([keysym, "FakeIM", true]);
                expect(kbd.onkeyevent.mock.calls[1].slice(0, 3)).toEqual([keysym, "FakeIM", false]);
            });
        }
    });

    describe('Escape AltGraph on Windows', function () {
        let origNavigator;
        beforeEach(function () {
            origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");
            Object.defineProperty(window, "navigator", {value: {}});
            window.navigator.platform = "Windows x86_64";

            jest.useFakeTimers();
        });
        afterEach(function () {
            Object.defineProperty(window, "navigator", origNavigator);
            jest.useRealTimers();
        });

        test('should supress ControlLeft until it knows if it is AltGr', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlLeft', key: 'Control', location: 1}));
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
        });

        test('should not trigger on repeating ControlLeft', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlLeft', key: 'Control', location: 1}));
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlLeft', key: 'Control', location: 1}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expect(kbd.onkeyevent.mock.calls[0].slice(0, 3)).toEqual([0xffe3, "ControlLeft", true]);
            expect(kbd.onkeyevent.mock.calls[1].slice(0, 3)).toEqual([0xffe3, "ControlLeft", true]);
        });

        test('should not supress ControlRight', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlRight', key: 'Control', location: 2}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expectCalledWith(kbd.onkeyevent, 0xffe4, "ControlRight", true);
        });

        test('should release ControlLeft after 100 ms', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlLeft', key: 'Control', location: 1}));
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
            jest.advanceTimersByTime(100);
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expectCalledWith(kbd.onkeyevent, 0xffe3, "ControlLeft", true);
        });

        test('should release ControlLeft on other key press', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlLeft', key: 'Control', location: 1}));
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
            kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'a'}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expect(kbd.onkeyevent.mock.calls[0].slice(0, 3)).toEqual([0xffe3, "ControlLeft", true]);
            expect(kbd.onkeyevent.mock.calls[1].slice(0, 3)).toEqual([0x61, "KeyA", true]);

            // Check that the timer is properly dead
            kbd.onkeyevent.mockClear();
            jest.advanceTimersByTime(100);
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
        });

        test('should release ControlLeft on other key release', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'KeyA', key: 'a'}));
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlLeft', key: 'Control', location: 1}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expect(kbd.onkeyevent.mock.calls[0].slice(0, 3)).toEqual([0x61, "KeyA", true]);
            kbd._handleKeyUp(keyevent('keyup', {code: 'KeyA', key: 'a'}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(3);
            expect(kbd.onkeyevent.mock.calls[1].slice(0, 3)).toEqual([0xffe3, "ControlLeft", true]);
            expect(kbd.onkeyevent.mock.calls[2].slice(0, 3)).toEqual([0x61, "KeyA", false]);

            // Check that the timer is properly dead
            kbd.onkeyevent.mockClear();
            jest.advanceTimersByTime(100);
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
        });

        test('should release ControlLeft on blur', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlLeft', key: 'Control', location: 1}));
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
            kbd._allKeysUp();
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expect(kbd.onkeyevent.mock.calls[0].slice(0, 3)).toEqual([0xffe3, "ControlLeft", true]);
            expect(kbd.onkeyevent.mock.calls[1].slice(0, 3)).toEqual([0xffe3, "ControlLeft", false]);

            // Check that the timer is properly dead
            kbd.onkeyevent.mockClear();
            jest.advanceTimersByTime(100);
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
        });

        test('should generate AltGraph for quick Ctrl+Alt sequence', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlLeft', key: 'Control', location: 1, timeStamp: Date.now()}));
            jest.advanceTimersByTime(20);
            kbd._handleKeyDown(keyevent('keydown', {code: 'AltRight', key: 'Alt', location: 2, timeStamp: Date.now()}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expectCalledWith(kbd.onkeyevent, 0xfe03, 'AltRight', true);

            // Check that the timer is properly dead
            kbd.onkeyevent.mockClear();
            jest.advanceTimersByTime(100);
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
        });

        test('should generate Ctrl, Alt for slow Ctrl+Alt sequence', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlLeft', key: 'Control', location: 1, timeStamp: Date.now()}));
            jest.advanceTimersByTime(60);
            kbd._handleKeyDown(keyevent('keydown', {code: 'AltRight', key: 'Alt', location: 2, timeStamp: Date.now()}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expect(kbd.onkeyevent.mock.calls[0].slice(0, 3)).toEqual([0xffe3, "ControlLeft", true]);
            expect(kbd.onkeyevent.mock.calls[1].slice(0, 3)).toEqual([0xffea, "AltRight", true]);

            // Check that the timer is properly dead
            kbd.onkeyevent.mockClear();
            jest.advanceTimersByTime(100);
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
        });

        test('should generate AltGraph for quick Ctrl+AltGraph sequence', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlLeft', key: 'Control', location: 1, timeStamp: Date.now()}));
            jest.advanceTimersByTime(20);
            kbd._handleKeyDown(keyevent('keydown', {code: 'AltRight', key: 'AltGraph', location: 2, timeStamp: Date.now()}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expectCalledWith(kbd.onkeyevent, 0xfe03, 'AltRight', true);

            // Check that the timer is properly dead
            kbd.onkeyevent.mockClear();
            jest.advanceTimersByTime(100);
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
        });

        test('should generate Ctrl, AltGraph for slow Ctrl+AltGraph sequence', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'ControlLeft', key: 'Control', location: 1, timeStamp: Date.now()}));
            jest.advanceTimersByTime(60);
            kbd._handleKeyDown(keyevent('keydown', {code: 'AltRight', key: 'AltGraph', location: 2, timeStamp: Date.now()}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expect(kbd.onkeyevent.mock.calls[0].slice(0, 3)).toEqual([0xffe3, "ControlLeft", true]);
            expect(kbd.onkeyevent.mock.calls[1].slice(0, 3)).toEqual([0xfe03, "AltRight", true]);

            // Check that the timer is properly dead
            kbd.onkeyevent.mockClear();
            jest.advanceTimersByTime(100);
            expect(kbd.onkeyevent).not.toHaveBeenCalled();
        });

        test('should pass through single Alt', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'AltRight', key: 'Alt', location: 2}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expectCalledWith(kbd.onkeyevent, 0xffea, 'AltRight', true);
        });

        test('should pass through single AltGr', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});
            kbd._handleKeyDown(keyevent('keydown', {code: 'AltRight', key: 'AltGraph', location: 2}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expectCalledWith(kbd.onkeyevent, 0xfe03, 'AltRight', true);
        });
    });

    describe('Missing Shift keyup on Windows', function () {
        let origNavigator;
        beforeEach(function () {
            origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");
            Object.defineProperty(window, "navigator", {value: {}});
            window.navigator.platform = "Windows x86_64";

            jest.useFakeTimers();
        });
        afterEach(function () {
            Object.defineProperty(window, "navigator", origNavigator);
            jest.useRealTimers();
        });

        test('should fake a left Shift keyup', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});

            kbd._handleKeyDown(keyevent('keydown', {code: 'ShiftLeft', key: 'Shift', location: 1}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expectCalledWith(kbd.onkeyevent, 0xffe1, 'ShiftLeft', true);
            kbd.onkeyevent.mockClear();

            kbd._handleKeyDown(keyevent('keydown', {code: 'ShiftRight', key: 'Shift', location: 2}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expectCalledWith(kbd.onkeyevent, 0xffe2, 'ShiftRight', true);
            kbd.onkeyevent.mockClear();

            kbd._handleKeyUp(keyevent('keyup', {code: 'ShiftLeft', key: 'Shift', location: 1}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expectCalledWith(kbd.onkeyevent, 0xffe2, 'ShiftRight', false);
            expectCalledWith(kbd.onkeyevent, 0xffe1, 'ShiftLeft', false);
        });

        test('should fake a right Shift keyup', function () {
            const kbd = new Keyboard(document);
            kbd.onkeyevent = mock(() => {});

            kbd._handleKeyDown(keyevent('keydown', {code: 'ShiftLeft', key: 'Shift', location: 1}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expectCalledWith(kbd.onkeyevent, 0xffe1, 'ShiftLeft', true);
            kbd.onkeyevent.mockClear();

            kbd._handleKeyDown(keyevent('keydown', {code: 'ShiftRight', key: 'Shift', location: 2}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(1);
            expectCalledWith(kbd.onkeyevent, 0xffe2, 'ShiftRight', true);
            kbd.onkeyevent.mockClear();

            kbd._handleKeyUp(keyevent('keyup', {code: 'ShiftRight', key: 'Shift', location: 2}));
            expect(kbd.onkeyevent).toHaveBeenCalledTimes(2);
            expectCalledWith(kbd.onkeyevent, 0xffe2, 'ShiftRight', false);
            expectCalledWith(kbd.onkeyevent, 0xffe1, 'ShiftLeft', false);
        });
    });
});
