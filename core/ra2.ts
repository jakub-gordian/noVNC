import { encodeUTF8 } from './util/strings.ts';
import EventTargetMixin from './util/eventtarget.ts';
import legacyCrypto from './crypto/crypto.ts';

interface Credentials {
    username?: string;
    password?: string;
}

interface Sock {
    rQwait(msg: string, num: number, goback?: number): boolean;
    rQpeekBytes(len: number, copy?: boolean): Uint8Array;
    rQshift16(): number;
    rQshift32(): number;
    rQshiftBytes(len: number, copy?: boolean): Uint8Array;
    sQpushBytes(bytes: Uint8Array): void;
    flush(): void;
}

interface CipherKey {
    algorithm: { name: string };
    encrypt?: (algorithm: any, data: any) => any;
    decrypt?: (algorithm: any, data: any) => any;
    exportKey?: () => any;
}

class RA2Cipher {
    _cipher: CipherKey | null;
    _counter: Uint8Array;

    constructor() {
        this._cipher = null;
        this._counter = new Uint8Array(16);
    }

    async setKey(key: Uint8Array): Promise<void> {
        this._cipher = await legacyCrypto.importKey(
            "raw", key, { name: "AES-EAX" }, false, ["encrypt, decrypt"]);
    }

    async makeMessage(message: Uint8Array): Promise<Uint8Array> {
        const ad = new Uint8Array([(message.length & 0xff00) >>> 8, message.length & 0xff]);
        const encrypted: Uint8Array = await legacyCrypto.encrypt({
            name: "AES-EAX",
            iv: this._counter,
            additionalData: ad,
        } as { name: string }, this._cipher!, message);
        for (let i = 0; i < 16 && this._counter[i]++ === 255; i++);
        const res = new Uint8Array(message.length + 2 + 16);
        res.set(ad);
        res.set(encrypted, 2);
        return res;
    }

    async receiveMessage(length: number, encrypted: Uint8Array): Promise<Uint8Array | null> {
        const ad = new Uint8Array([(length & 0xff00) >>> 8, length & 0xff]);
        const res: Uint8Array | null = await legacyCrypto.decrypt({
            name: "AES-EAX",
            iv: this._counter,
            additionalData: ad,
        } as { name: string }, this._cipher!, encrypted);
        for (let i = 0; i < 16 && this._counter[i]++ === 255; i++);
        return res;
    }
}

export default class RSAAESAuthenticationState extends EventTargetMixin {
    _hasStarted: boolean;
    _checkSock: (() => void) | null;
    _checkCredentials: (() => void) | null;
    _approveServerResolve: ((value?: void) => void) | null;
    _sockReject: ((reason?: any) => void) | null;
    _credentialsReject: ((reason?: any) => void) | null;
    _approveServerReject: ((reason?: any) => void) | null;
    _sock: Sock;
    _getCredentials: () => Credentials;

    constructor(sock: Sock, getCredentials: () => Credentials) {
        super();
        this._hasStarted = false;
        this._checkSock = null;
        this._checkCredentials = null;
        this._approveServerResolve = null;
        this._sockReject = null;
        this._credentialsReject = null;
        this._approveServerReject = null;
        this._sock = sock;
        this._getCredentials = getCredentials;
    }

    _waitSockAsync(len: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const hasData = (): boolean => !this._sock.rQwait('RA2', len);
            if (hasData()) {
                resolve();
            } else {
                this._checkSock = () => {
                    if (hasData()) {
                        resolve();
                        this._checkSock = null;
                        this._sockReject = null;
                    }
                };
                this._sockReject = reject;
            }
        });
    }

    _waitApproveKeyAsync(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._approveServerResolve = resolve;
            this._approveServerReject = reject;
        });
    }

    _waitCredentialsAsync(subtype: number): Promise<void> {
        const hasCredentials = (): boolean => {
            if (subtype === 1 && this._getCredentials().username !== undefined &&
                this._getCredentials().password !== undefined) {
                return true;
            } else if (subtype === 2 && this._getCredentials().password !== undefined) {
                return true;
            }
            return false;
        };
        return new Promise<void>((resolve, reject) => {
            if (hasCredentials()) {
                resolve();
            } else {
                this._checkCredentials = () => {
                    if (hasCredentials()) {
                        resolve();
                        this._checkCredentials = null;
                        this._credentialsReject = null;
                    }
                };
                this._credentialsReject = reject;
            }
        });
    }

    checkInternalEvents(): void {
        if (this._checkSock !== null) {
            this._checkSock();
        }
        if (this._checkCredentials !== null) {
            this._checkCredentials();
        }
    }

    approveServer(): void {
        if (this._approveServerResolve !== null) {
            this._approveServerResolve();
            this._approveServerResolve = null;
        }
    }

    disconnect(): void {
        if (this._sockReject !== null) {
            this._sockReject(new Error("disconnect normally"));
            this._sockReject = null;
        }
        if (this._credentialsReject !== null) {
            this._credentialsReject(new Error("disconnect normally"));
            this._credentialsReject = null;
        }
        if (this._approveServerReject !== null) {
            this._approveServerReject(new Error("disconnect normally"));
            this._approveServerReject = null;
        }
    }

    async negotiateRA2neAuthAsync(): Promise<void> {
        this._hasStarted = true;
        // 1: Receive server public key
        await this._waitSockAsync(4);
        const serverKeyLengthBuffer = this._sock.rQpeekBytes(4);
        const serverKeyLength = this._sock.rQshift32();
        if (serverKeyLength < 1024) {
            throw new Error("RA2: server public key is too short: " + serverKeyLength);
        } else if (serverKeyLength > 8192) {
            throw new Error("RA2: server public key is too long: " + serverKeyLength);
        }
        const serverKeyBytes = Math.ceil(serverKeyLength / 8);
        await this._waitSockAsync(serverKeyBytes * 2);
        const serverN = this._sock.rQshiftBytes(serverKeyBytes);
        const serverE = this._sock.rQshiftBytes(serverKeyBytes);
        const serverRSACipher: CipherKey = await legacyCrypto.importKey(
            "raw", { n: serverN, e: serverE }, { name: "RSA-PKCS1-v1_5" }, false, ["encrypt"]);
        const serverPublickey = new Uint8Array(4 + serverKeyBytes * 2);
        serverPublickey.set(serverKeyLengthBuffer);
        serverPublickey.set(serverN, 4);
        serverPublickey.set(serverE, 4 + serverKeyBytes);

        // verify server public key
        let approveKey = this._waitApproveKeyAsync();
        this.dispatchEvent(new CustomEvent("serververification", {
            detail: { type: "RSA", publickey: serverPublickey }
        }));
        await approveKey;

        // 2: Send client public key
        const clientKeyLength = 2048;
        const clientKeyBytes = Math.ceil(clientKeyLength / 8);
        const clientRSACipher: CipherKey = (await legacyCrypto.generateKey({
            name: "RSA-PKCS1-v1_5",
            modulusLength: clientKeyLength,
            publicExponent: new Uint8Array([1, 0, 1]),
        } as { name: string }, true, ["encrypt"])).privateKey;
        const clientExportedRSAKey: { n: Uint8Array; e: Uint8Array } = await legacyCrypto.exportKey("raw", clientRSACipher);
        const clientN = clientExportedRSAKey.n;
        const clientE = clientExportedRSAKey.e;
        const clientPublicKey = new Uint8Array(4 + clientKeyBytes * 2);
        clientPublicKey[0] = (clientKeyLength & 0xff000000) >>> 24;
        clientPublicKey[1] = (clientKeyLength & 0xff0000) >>> 16;
        clientPublicKey[2] = (clientKeyLength & 0xff00) >>> 8;
        clientPublicKey[3] = clientKeyLength & 0xff;
        clientPublicKey.set(clientN, 4);
        clientPublicKey.set(clientE, 4 + clientKeyBytes);
        this._sock.sQpushBytes(clientPublicKey);
        this._sock.flush();

        // 3: Send client random
        const clientRandom = new Uint8Array(16);
        window.crypto.getRandomValues(clientRandom);
        const clientEncryptedRandom: Uint8Array = await legacyCrypto.encrypt(
            { name: "RSA-PKCS1-v1_5" }, serverRSACipher, clientRandom);
        const clientRandomMessage = new Uint8Array(2 + serverKeyBytes);
        clientRandomMessage[0] = (serverKeyBytes & 0xff00) >>> 8;
        clientRandomMessage[1] = serverKeyBytes & 0xff;
        clientRandomMessage.set(clientEncryptedRandom, 2);
        this._sock.sQpushBytes(clientRandomMessage);
        this._sock.flush();

        // 4: Receive server random
        await this._waitSockAsync(2);
        if (this._sock.rQshift16() !== clientKeyBytes) {
            throw new Error("RA2: wrong encrypted message length");
        }
        const serverEncryptedRandom = this._sock.rQshiftBytes(clientKeyBytes);
        const serverRandom: Uint8Array | null = await legacyCrypto.decrypt(
            { name: "RSA-PKCS1-v1_5" }, clientRSACipher, serverEncryptedRandom);
        if (serverRandom === null || serverRandom.length !== 16) {
            throw new Error("RA2: corrupted server encrypted random");
        }

        // 5: Compute session keys and set ciphers
        let clientSessionKey: Uint8Array | ArrayBuffer = new Uint8Array(32);
        let serverSessionKey: Uint8Array | ArrayBuffer = new Uint8Array(32);
        (clientSessionKey as Uint8Array).set(serverRandom);
        (clientSessionKey as Uint8Array).set(clientRandom, 16);
        (serverSessionKey as Uint8Array).set(clientRandom);
        (serverSessionKey as Uint8Array).set(serverRandom, 16);
        clientSessionKey = await window.crypto.subtle.digest("SHA-1", clientSessionKey as unknown as BufferSource);
        clientSessionKey = new Uint8Array(clientSessionKey).slice(0, 16);
        serverSessionKey = await window.crypto.subtle.digest("SHA-1", serverSessionKey as unknown as BufferSource);
        serverSessionKey = new Uint8Array(serverSessionKey).slice(0, 16);
        const clientCipher = new RA2Cipher();
        await clientCipher.setKey(clientSessionKey);
        const serverCipher = new RA2Cipher();
        await serverCipher.setKey(serverSessionKey);

        // 6: Compute and exchange hashes
        let serverHash: Uint8Array | ArrayBuffer = new Uint8Array(8 + serverKeyBytes * 2 + clientKeyBytes * 2);
        let clientHash: Uint8Array | ArrayBuffer = new Uint8Array(8 + serverKeyBytes * 2 + clientKeyBytes * 2);
        (serverHash as Uint8Array).set(serverPublickey);
        (serverHash as Uint8Array).set(clientPublicKey, 4 + serverKeyBytes * 2);
        (clientHash as Uint8Array).set(clientPublicKey);
        (clientHash as Uint8Array).set(serverPublickey, 4 + clientKeyBytes * 2);
        serverHash = await window.crypto.subtle.digest("SHA-1", serverHash as unknown as BufferSource);
        clientHash = await window.crypto.subtle.digest("SHA-1", clientHash as unknown as BufferSource);
        serverHash = new Uint8Array(serverHash);
        clientHash = new Uint8Array(clientHash);
        this._sock.sQpushBytes(await clientCipher.makeMessage(clientHash));
        this._sock.flush();
        await this._waitSockAsync(2 + 20 + 16);
        if (this._sock.rQshift16() !== 20) {
            throw new Error("RA2: wrong server hash");
        }
        const serverHashReceived = await serverCipher.receiveMessage(
            20, this._sock.rQshiftBytes(20 + 16));
        if (serverHashReceived === null) {
            throw new Error("RA2: failed to authenticate the message");
        }
        for (let i = 0; i < 20; i++) {
            if (serverHashReceived[i] !== (serverHash as Uint8Array)[i]) {
                throw new Error("RA2: wrong server hash");
            }
        }

        // 7: Receive subtype
        await this._waitSockAsync(2 + 1 + 16);
        if (this._sock.rQshift16() !== 1) {
            throw new Error("RA2: wrong subtype");
        }
        let subtypeArray = (await serverCipher.receiveMessage(
            1, this._sock.rQshiftBytes(1 + 16)));
        if (subtypeArray === null) {
            throw new Error("RA2: failed to authenticate the message");
        }
        const subtype = subtypeArray[0];
        let waitCredentials = this._waitCredentialsAsync(subtype);
        if (subtype === 1) {
            if (this._getCredentials().username === undefined ||
                this._getCredentials().password === undefined) {
                this.dispatchEvent(new CustomEvent(
                    "credentialsrequired",
                    { detail: { types: ["username", "password"] } }));
            }
        } else if (subtype === 2) {
            if (this._getCredentials().password === undefined) {
                this.dispatchEvent(new CustomEvent(
                    "credentialsrequired",
                    { detail: { types: ["password"] } }));
            }
        } else {
            throw new Error("RA2: wrong subtype");
        }
        await waitCredentials;
        let username: string;
        if (subtype === 1) {
            username = encodeUTF8(this._getCredentials().username!).slice(0, 255);
        } else {
            username = "";
        }
        const password = encodeUTF8(this._getCredentials().password!).slice(0, 255);
        const credentials = new Uint8Array(username.length + password.length + 2);
        credentials[0] = username.length;
        credentials[username.length + 1] = password.length;
        for (let i = 0; i < username.length; i++) {
            credentials[i + 1] = username.charCodeAt(i);
        }
        for (let i = 0; i < password.length; i++) {
            credentials[username.length + 2 + i] = password.charCodeAt(i);
        }
        this._sock.sQpushBytes(await clientCipher.makeMessage(credentials));
        this._sock.flush();
    }

    get hasStarted(): boolean {
        return this._hasStarted;
    }

    set hasStarted(s: boolean) {
        this._hasStarted = s;
    }
}
