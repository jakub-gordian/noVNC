import { modPow, bigIntToU8Array, u8ArrayToBigInt } from "./bigint.ts";

class DHPublicKey {
    _key: Uint8Array;

    constructor(key: Uint8Array) {
        this._key = key;
    }

    get algorithm(): { name: string } {
        return { name: "DH" };
    }

    exportKey(): Uint8Array {
        return this._key;
    }
}

export class DHCipher {
    _keyBytes!: number;
    _gBigInt: bigint | null;
    _pBigInt: bigint | null;
    _privateKey: Uint8Array | null;
    _privateKeyBigInt!: bigint;
    _publicKey!: Uint8Array;

    constructor() {
        this._gBigInt = null;
        this._pBigInt = null;
        this._privateKey = null;
    }

    get algorithm(): { name: string } {
        return { name: "DH" };
    }

    static generateKey(algorithm: { g: Uint8Array; p: Uint8Array }, _extractable: boolean): { privateKey: DHCipher; publicKey: DHPublicKey } {
        const cipher = new DHCipher;
        cipher._generateKey(algorithm);
        return { privateKey: cipher, publicKey: new DHPublicKey(cipher._publicKey) };
    }

    _generateKey(algorithm: { g: Uint8Array; p: Uint8Array }): void {
        const g = algorithm.g;
        const p = algorithm.p;
        this._keyBytes = p.length;
        this._gBigInt = u8ArrayToBigInt(g);
        this._pBigInt = u8ArrayToBigInt(p);
        this._privateKey = window.crypto.getRandomValues(new Uint8Array(this._keyBytes));
        this._privateKeyBigInt = u8ArrayToBigInt(this._privateKey);
        this._publicKey = bigIntToU8Array(modPow(
            this._gBigInt, this._privateKeyBigInt, this._pBigInt), this._keyBytes);
    }

    deriveBits(algorithm: { public: Uint8Array }, length: number): Uint8Array {
        const bytes = Math.ceil(length / 8);
        const pkey = new Uint8Array(algorithm.public);
        const len = bytes > this._keyBytes ? bytes : this._keyBytes;
        const secret = modPow(u8ArrayToBigInt(pkey), this._privateKeyBigInt, this._pBigInt!);
        return bigIntToU8Array(secret, len).slice(0, len);
    }
}
