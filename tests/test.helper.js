import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import keysyms from '../core/input/keysymdef.js';
import * as KeyboardUtil from "../core/input/util.js";

describe('Helpers', () => {

    describe('keysyms.lookup', () => {
        test('should map ASCII characters to keysyms', () => {
            expect(keysyms.lookup('a'.charCodeAt())).toBe(0x61);
            expect(keysyms.lookup('A'.charCodeAt())).toBe(0x41);
        });
        test('should map Latin-1 characters to keysyms', () => {
            expect(keysyms.lookup('\u00f8'.charCodeAt())).toBe(0xf8);

            expect(keysyms.lookup('\u00e9'.charCodeAt())).toBe(0xe9);
        });
        test('should map characters that are in Windows-1252 but not in Latin-1 to keysyms', () => {
            expect(keysyms.lookup('\u0160'.charCodeAt())).toBe(0x01a9);
        });
        test('should map characters which aren\'t in Latin1 *or* Windows-1252 to keysyms', () => {
            expect(keysyms.lookup('\u0169'.charCodeAt())).toBe(0x03fd);
        });
        test('should map unknown codepoints to the Unicode range', () => {
            expect(keysyms.lookup('\n'.charCodeAt())).toBe(0x100000a);
            expect(keysyms.lookup('\u262D'.charCodeAt())).toBe(0x100262d);
        });
        // This requires very recent versions of most browsers... skipping for now
        test.skip('should map UCS-4 codepoints to the Unicode range', () => {
            //expect(keysyms.lookup('\u{1F686}'.codePointAt())).toBe(0x101f686);
        });
    });

    describe('getKeycode', () => {
        test('should pass through proper code', () => {
            expect(KeyboardUtil.getKeycode({code: 'Semicolon'})).toBe('Semicolon');
        });
        test('should map legacy values', () => {
            expect(KeyboardUtil.getKeycode({code: ''})).toBe('Unidentified');
            expect(KeyboardUtil.getKeycode({code: 'OSLeft'})).toBe('MetaLeft');
        });
        test('should map keyCode to code when possible', () => {
            expect(KeyboardUtil.getKeycode({keyCode: 0x14})).toBe('CapsLock');
            expect(KeyboardUtil.getKeycode({keyCode: 0x5b})).toBe('MetaLeft');
            expect(KeyboardUtil.getKeycode({keyCode: 0x35})).toBe('Digit5');
            expect(KeyboardUtil.getKeycode({keyCode: 0x65})).toBe('Numpad5');
        });
        test('should map keyCode left/right side', () => {
            expect(KeyboardUtil.getKeycode({keyCode: 0x10, location: 1})).toBe('ShiftLeft');
            expect(KeyboardUtil.getKeycode({keyCode: 0x10, location: 2})).toBe('ShiftRight');
            expect(KeyboardUtil.getKeycode({keyCode: 0x11, location: 1})).toBe('ControlLeft');
            expect(KeyboardUtil.getKeycode({keyCode: 0x11, location: 2})).toBe('ControlRight');
        });
        test('should map keyCode on numpad', () => {
            expect(KeyboardUtil.getKeycode({keyCode: 0x0d, location: 0})).toBe('Enter');
            expect(KeyboardUtil.getKeycode({keyCode: 0x0d, location: 3})).toBe('NumpadEnter');
            expect(KeyboardUtil.getKeycode({keyCode: 0x23, location: 0})).toBe('End');
            expect(KeyboardUtil.getKeycode({keyCode: 0x23, location: 3})).toBe('Numpad1');
        });
        test('should return Unidentified when it cannot map the keyCode', () => {
            expect(KeyboardUtil.getKeycode({keycode: 0x42})).toBe('Unidentified');
        });

        describe('Fix Meta on macOS', () => {
            let origNavigator;
            beforeEach(() => {
                // window.navigator is a protected read-only property in many
                // environments, so we need to redefine it whilst running these
                // tests.
                origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");

                Object.defineProperty(window, "navigator", {value: {}});
                window.navigator.platform = "Mac x86_64";
            });
            afterEach(() => {
                Object.defineProperty(window, "navigator", origNavigator);
            });

            test('should respect ContextMenu on modern browser', () => {
                expect(KeyboardUtil.getKeycode({code: 'ContextMenu', keyCode: 0x5d})).toBe('ContextMenu');
            });
            test('should translate legacy ContextMenu to MetaRight', () => {
                expect(KeyboardUtil.getKeycode({keyCode: 0x5d})).toBe('MetaRight');
            });
        });
    });

    describe('getKey', () => {
        test('should prefer key', () => {
            expect(KeyboardUtil.getKey({key: 'a', charCode: '\u0160'.charCodeAt(), keyCode: 0x42, which: 0x43})).toBe('a');
        });
        test('should map legacy values', () => {
            expect(KeyboardUtil.getKey({key: 'OS'})).toBe('Meta');
            expect(KeyboardUtil.getKey({key: 'UIKeyInputLeftArrow'})).toBe('ArrowLeft');
        });
        test('should handle broken Delete', () => {
            expect(KeyboardUtil.getKey({key: '\x00', code: 'NumpadDecimal'})).toBe('Delete');
        });
        test('should use code if no key', () => {
            expect(KeyboardUtil.getKey({code: 'NumpadBackspace'})).toBe('Backspace');
        });
        test('should not use code fallback for character keys', () => {
            expect(KeyboardUtil.getKey({code: 'KeyA'})).toBe('Unidentified');
            expect(KeyboardUtil.getKey({code: 'Digit1'})).toBe('Unidentified');
            expect(KeyboardUtil.getKey({code: 'Period'})).toBe('Unidentified');
            expect(KeyboardUtil.getKey({code: 'Numpad1'})).toBe('Unidentified');
        });
        test('should use charCode if no key', () => {
            expect(KeyboardUtil.getKey({charCode: '\u0160'.charCodeAt(), keyCode: 0x42, which: 0x43})).toBe('\u0160');
            // Broken Oculus browser
            expect(KeyboardUtil.getKey({charCode: '\u0160'.charCodeAt(), keyCode: 0x42, which: 0x43, key: 'Unidentified'})).toBe('\u0160');
        });
        test('should return Unidentified when it cannot map the key', () => {
            expect(KeyboardUtil.getKey({keycode: 0x42})).toBe('Unidentified');
        });
    });

    describe('getKeysym', () => {
        describe('Non-character keys', () => {
            test('should recognize the right keys', () => {
                expect(KeyboardUtil.getKeysym({key: 'Enter'})).toBe(0xFF0D);
                expect(KeyboardUtil.getKeysym({key: 'Backspace'})).toBe(0xFF08);
                expect(KeyboardUtil.getKeysym({key: 'Tab'})).toBe(0xFF09);
                expect(KeyboardUtil.getKeysym({key: 'Shift'})).toBe(0xFFE1);
                expect(KeyboardUtil.getKeysym({key: 'Control'})).toBe(0xFFE3);
                expect(KeyboardUtil.getKeysym({key: 'Alt'})).toBe(0xFFE9);
                expect(KeyboardUtil.getKeysym({key: 'Meta'})).toBe(0xFFEB);
                expect(KeyboardUtil.getKeysym({key: 'Escape'})).toBe(0xFF1B);
                expect(KeyboardUtil.getKeysym({key: 'ArrowUp'})).toBe(0xFF52);
            });
            test('should map left/right side', () => {
                expect(KeyboardUtil.getKeysym({key: 'Shift', location: 1})).toBe(0xFFE1);
                expect(KeyboardUtil.getKeysym({key: 'Shift', location: 2})).toBe(0xFFE2);
                expect(KeyboardUtil.getKeysym({key: 'Control', location: 1})).toBe(0xFFE3);
                expect(KeyboardUtil.getKeysym({key: 'Control', location: 2})).toBe(0xFFE4);
            });
            test('should handle AltGraph', () => {
                expect(KeyboardUtil.getKeysym({code: 'AltRight', key: 'Alt', location: 2})).toBe(0xFFEA);
                expect(KeyboardUtil.getKeysym({code: 'AltRight', key: 'AltGraph', location: 2})).toBe(0xFE03);
            });
            test('should handle Windows key with incorrect location', () => {
                expect(KeyboardUtil.getKeysym({key: 'Meta', location: 0})).toBe(0xFFEC);
            });
            test.skip('should handle Clear/NumLock key with incorrect location', () => {
                // Broken because of Clear/NumLock override
                expect(KeyboardUtil.getKeysym({key: 'Clear', code: 'NumLock', location: 3})).toBe(0xFF0B);
            });
            test('should handle Meta/Windows distinction', () => {
                expect(KeyboardUtil.getKeysym({code: 'AltLeft', key: 'Meta', location: 1})).toBe(0xFFE7);
                expect(KeyboardUtil.getKeysym({code: 'AltRight', key: 'Meta', location: 2})).toBe(0xFFE8);
                expect(KeyboardUtil.getKeysym({code: 'MetaLeft', key: 'Meta', location: 1})).toBe(0xFFEB);
                expect(KeyboardUtil.getKeysym({code: 'MetaRight', key: 'Meta', location: 2})).toBe(0xFFEC);
            });
            test('should send NumLock even if key is Clear', () => {
                expect(KeyboardUtil.getKeysym({key: 'Clear', code: 'NumLock'})).toBe(0xFF7F);
            });
            test('should return null for unknown keys', () => {
                expect(KeyboardUtil.getKeysym({key: 'Semicolon'})).toBeNull();
                expect(KeyboardUtil.getKeysym({key: 'BracketRight'})).toBeNull();
            });
            test('should handle remappings', () => {
                expect(KeyboardUtil.getKeysym({code: 'ControlLeft', key: 'Tab'})).toBe(0xFF09);
            });
        });

        describe('Numpad', () => {
            test('should handle Numpad numbers', () => {
                expect(KeyboardUtil.getKeysym({code: 'Digit5', key: '5', location: 0})).toBe(0x0035);
                expect(KeyboardUtil.getKeysym({code: 'Numpad5', key: '5', location: 3})).toBe(0xFFB5);
            });
            test('should handle Numpad non-character keys', () => {
                expect(KeyboardUtil.getKeysym({code: 'Home', key: 'Home', location: 0})).toBe(0xFF50);
                expect(KeyboardUtil.getKeysym({code: 'Numpad5', key: 'Home', location: 3})).toBe(0xFF95);
                expect(KeyboardUtil.getKeysym({code: 'Delete', key: 'Delete', location: 0})).toBe(0xFFFF);
                expect(KeyboardUtil.getKeysym({code: 'NumpadDecimal', key: 'Delete', location: 3})).toBe(0xFF9F);
            });
            test('should handle Numpad Decimal key', () => {
                expect(KeyboardUtil.getKeysym({code: 'NumpadDecimal', key: '.', location: 3})).toBe(0xFFAE);
                expect(KeyboardUtil.getKeysym({code: 'NumpadDecimal', key: ',', location: 3})).toBe(0xFFAC);
            });
        });

        describe('Japanese IM keys on Windows', () => {
            let origNavigator;
            beforeEach(() => {
                // window.navigator is a protected read-only property in many
                // environments, so we need to redefine it whilst running these
                // tests.
                origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");

                Object.defineProperty(window, "navigator", {value: {}});
                window.navigator.platform = "Windows";
            });

            afterEach(() => {
                Object.defineProperty(window, "navigator", origNavigator);
            });

            const keys = { 'Zenkaku': 0xff2a, 'Hankaku': 0xff2a,
                           'Romaji': 0xff24, 'KanaMode': 0xff24 };
            for (let [key, keysym] of Object.entries(keys)) {
                test(`should fake combined key for ${key} on Windows`, () => {
                    expect(KeyboardUtil.getKeysym({code: 'FakeIM', key: key})).toBe(keysym);
                });
            }
        });
    });
});
