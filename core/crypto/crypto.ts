import { AESECBCipher, AESEAXCipher } from "./aes.ts";
import { DESCBCCipher, DESECBCipher } from "./des.ts";
import { RSACipher } from "./rsa.ts";
import { DHCipher } from "./dh.ts";
import { MD5 } from "./md5.ts";

// A cipher key with algorithm info, encrypt/decrypt/exportKey/deriveBits methods
interface CipherKey {
    algorithm: { name: string };
    encrypt?: (algorithm: any, data: any) => any;
    decrypt?: (algorithm: any, data: any) => any;
    exportKey?: () => any;
    deriveBits?: (algorithm: any, length: number) => any;
}

// A cipher class with static factory methods
interface CipherClass {
    importKey?: (key: any, algorithm: any, extractable: boolean, keyUsages: string[]) => any;
    generateKey?: (algorithm: any, extractable: boolean, keyUsages: string[]) => any;
}

type DigestFunction = (data: Uint8Array) => Promise<Uint8Array>;

interface AlgorithmMap {
    [name: string]: CipherClass | DigestFunction;
}

// A single interface for the cryptographic algorithms not supported by SubtleCrypto.
// Both synchronous and asynchronous implmentations are allowed.
class LegacyCrypto {
    _algorithms: AlgorithmMap;

    constructor() {
        this._algorithms = {
            "AES-ECB": AESECBCipher,
            "AES-EAX": AESEAXCipher,
            "DES-ECB": DESECBCipher,
            "DES-CBC": DESCBCCipher,
            "RSA-PKCS1-v1_5": RSACipher,
            "DH": DHCipher,
            "MD5": MD5,
        };
    }

    encrypt(algorithm: { name: string }, key: CipherKey, data: any): any {
        if (key.algorithm.name !== algorithm.name) {
            throw new Error("algorithm does not match");
        }
        if (typeof key.encrypt !== "function") {
            throw new Error("key does not support encryption");
        }
        return key.encrypt(algorithm, data);
    }

    decrypt(algorithm: { name: string }, key: CipherKey, data: any): any {
        if (key.algorithm.name !== algorithm.name) {
            throw new Error("algorithm does not match");
        }
        if (typeof key.decrypt !== "function") {
            throw new Error("key does not support encryption");
        }
        return key.decrypt(algorithm, data);
    }

    importKey(format: string, keyData: any, algorithm: { name: string }, extractable: boolean, keyUsages: string[]): any {
        if (format !== "raw") {
            throw new Error("key format is not supported");
        }
        const alg = this._algorithms[algorithm.name] as CipherClass | undefined;
        if (typeof alg === "undefined" || typeof alg.importKey !== "function") {
            throw new Error("algorithm is not supported");
        }
        return alg.importKey(keyData, algorithm, extractable, keyUsages);
    }

    generateKey(algorithm: { name: string }, extractable: boolean, keyUsages: string[]): any {
        const alg = this._algorithms[algorithm.name] as CipherClass | undefined;
        if (typeof alg === "undefined" || typeof alg.generateKey !== "function") {
            throw new Error("algorithm is not supported");
        }
        return alg.generateKey(algorithm, extractable, keyUsages);
    }

    exportKey(format: string, key: CipherKey): any {
        if (format !== "raw") {
            throw new Error("key format is not supported");
        }
        if (typeof key.exportKey !== "function") {
            throw new Error("key does not support exportKey");
        }
        return key.exportKey();
    }

    digest(algorithm: string, data: Uint8Array): any {
        const alg = this._algorithms[algorithm] as DigestFunction | undefined;
        if (typeof alg !== "function") {
            throw new Error("algorithm is not supported");
        }
        return alg(data);
    }

    deriveBits(algorithm: { name: string }, key: CipherKey, length: number): any {
        if (key.algorithm.name !== algorithm.name) {
            throw new Error("algorithm does not match");
        }
        if (typeof key.deriveBits !== "function") {
            throw new Error("key does not support deriveBits");
        }
        return key.deriveBits(algorithm, length);
    }
}

export default new LegacyCrypto;
