import Base64 from '../core/base64.ts';

export default class FakeWebSocket {
    url: string;
    binaryType: string;
    extensions: string;
    protocol: string;
    readyState: number;
    bufferedAmount: number;
    _sendQueue: Uint8Array;
    _isFake: boolean;

    onerror: ((ev: Event) => void) | null;
    onmessage: ((ev: MessageEvent) => void) | null;
    onopen: ((ev: Event) => void) | null;
    onclose: ((ev: CloseEvent) => void) | null;

    static OPEN: number;
    static CONNECTING: number;
    static CLOSING: number;
    static CLOSED: number;
    static _isFake: boolean;
    static _realVersion: typeof WebSocket | null;

    constructor(uri: string, protocols?: string | string[]) {
        this.url = uri;
        this.binaryType = "arraybuffer";
        this.extensions = "";

        this.onerror = null;
        this.onmessage = null;
        this.onopen = null;
        this.onclose = null;

        if (!protocols || typeof protocols === 'string') {
            this.protocol = protocols as string;
        } else {
            this.protocol = protocols[0]!;
        }

        this._sendQueue = new Uint8Array(20000);

        this.readyState = FakeWebSocket.CONNECTING;
        this.bufferedAmount = 0;

        this._isFake = true;
    }

    close(code?: number, reason?: string): void {
        this.readyState = FakeWebSocket.CLOSED;
        if (this.onclose) {
            this.onclose(new CloseEvent("close", { 'code': code, 'reason': reason, 'wasClean': true }));
        }
    }

    send(data: ArrayBuffer | Uint8Array | string): void {
        let bytes: Uint8Array | number[];
        if (this.protocol == 'base64') {
            bytes = Base64.decode(data as string);
        } else {
            bytes = new Uint8Array(data as ArrayBuffer);
        }
        if (this.bufferedAmount + bytes.length > this._sendQueue.length) {
            let newlen = this._sendQueue.length;
            while (this.bufferedAmount + bytes.length > newlen) {
                newlen *= 2;
            }
            let newbuf = new Uint8Array(newlen);
            newbuf.set(this._sendQueue);
            this._sendQueue = newbuf;
        }
        this._sendQueue.set(bytes, this.bufferedAmount);
        this.bufferedAmount += bytes.length;
    }

    _getSentData(): Uint8Array {
        const res = this._sendQueue.slice(0, this.bufferedAmount);
        this.bufferedAmount = 0;
        return res;
    }

    _open(): void {
        this.readyState = FakeWebSocket.OPEN;
        if (this.onopen) {
            this.onopen(new Event('open'));
        }
    }

    _receiveData(data: Uint8Array): void {
        if (data.length < 4096) {
            // Break apart the data to expose bugs where we assume data is
            // neatly packaged
            for (let i = 0; i < data.length; i++) {
                let buf = data.slice(i, i+1);
                this.onmessage!(new MessageEvent("message", { 'data': buf.buffer }));
            }
        } else {
            this.onmessage!(new MessageEvent("message", { 'data': data.buffer }));
        }
    }

    static replace(): void {
        if (!(WebSocket as any)._isFake) {
            const realVersion = WebSocket;
            // eslint-disable-next-line no-global-assign
            (globalThis as any).WebSocket = FakeWebSocket;
            FakeWebSocket._realVersion = realVersion;
        }
    }

    static restore(): void {
        if ((WebSocket as any)._isFake) {
            // eslint-disable-next-line no-global-assign
            (globalThis as any).WebSocket = FakeWebSocket._realVersion;
        }
    }
}

FakeWebSocket.OPEN = WebSocket.OPEN;
FakeWebSocket.CONNECTING = WebSocket.CONNECTING;
FakeWebSocket.CLOSING = WebSocket.CLOSING;
FakeWebSocket.CLOSED = WebSocket.CLOSED;
FakeWebSocket._isFake = true;
FakeWebSocket._realVersion = null;
