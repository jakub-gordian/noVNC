import { describe, expect, test } from "bun:test";
import { toUnsigned32bit, toSigned32bit } from '../core/util/int.ts';

describe('Integer casting', () => {
    test('should cast unsigned to signed', () => {
        let expected = 4294967286;
        expect(toUnsigned32bit(-10)).toBe(expected);
    });

    test('should cast signed to unsigned', () => {
        let expected = -10;
        expect(toSigned32bit(4294967286)).toBe(expected);
    });
});
