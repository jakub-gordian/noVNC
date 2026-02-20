import { describe, expect, test, beforeEach, afterEach, beforeAll, afterAll, mock, spyOn } from "bun:test";
import "./test-helpers.ts";

import Websock from '../core/websock.ts';
import FakeWebSocket from './fake.websocket.ts';

describe('Websock', function () {
    describe('Receive queue methods', function () {
        let sock: any, websock: any;

        beforeEach(function () {
            sock = new Websock();
            websock = new FakeWebSocket('ws://localhost');
            websock._open();
            sock.attach(websock);
        });

        describe('rQpeek8', function () {
            test('should peek at the next byte without poping it off the queue', function () {
                websock._receiveData(new Uint8Array([0xab, 0xcd]));
                expect(sock.rQpeek8()).toBe(0xab);
                expect(sock.rQpeek8()).toBe(0xab);
            });
        });

        describe('rQshift8()', function () {
            test('should pop a single byte from the receive queue', function () {
                websock._receiveData(new Uint8Array([0xab, 0xcd]));
                expect(sock.rQshift8()).toBe(0xab);
                expect(sock.rQshift8()).toBe(0xcd);
            });
        });

        describe('rQshift16()', function () {
            test('should pop two bytes from the receive queue and return a single number', function () {
                websock._receiveData(new Uint8Array([0xab, 0xcd, 0x12, 0x34]));
                expect(sock.rQshift16()).toBe(0xabcd);
                expect(sock.rQshift16()).toBe(0x1234);
            });
        });

        describe('rQshift32()', function () {
            test('should pop four bytes from the receive queue and return a single number', function () {
                websock._receiveData(new Uint8Array([0xab, 0xcd, 0x12, 0x34,
                                                     0x88, 0xee, 0x11, 0x33]));
                expect(sock.rQshift32()).toBe(0xabcd1234);
                expect(sock.rQshift32()).toBe(0x88ee1133);
            });
        });

        describe('rQshiftStr', function () {
            test('should shift the given number of bytes off of the receive queue and return a string', function () {
                websock._receiveData(new Uint8Array([0xab, 0xcd, 0x12, 0x34,
                                                     0x88, 0xee, 0x11, 0x33]));
                expect(sock.rQshiftStr(4)).toBe('\xab\xcd\x12\x34');
                expect(sock.rQshiftStr(4)).toBe('\x88\xee\x11\x33');
            });

            test('should be able to handle very large strings', function () {
                const BIG_LEN = 500000;
                const incoming = new Uint8Array(BIG_LEN);
                let expected = "";
                let letterCode = 'a'.charCodeAt(0);
                for (let i = 0; i < BIG_LEN; i++) {
                    incoming[i] = letterCode;
                    expected += String.fromCharCode(letterCode);

                    if (letterCode < 'z'.charCodeAt(0)) {
                        letterCode++;
                    } else {
                        letterCode = 'a'.charCodeAt(0);
                    }
                }
                websock._receiveData(incoming);

                const shifted = sock.rQshiftStr(BIG_LEN);

                expect(shifted).toBe(expected);
            });
        });

        describe('rQshiftBytes', function () {
            test('should shift the given number of bytes of the receive queue and return an array', function () {
                websock._receiveData(new Uint8Array([0xab, 0xcd, 0x12, 0x34,
                                                     0x88, 0xee, 0x11, 0x33]));
                expect(sock.rQshiftBytes(4)).toEqualArray(new Uint8Array([0xab, 0xcd, 0x12, 0x34]));
                expect(sock.rQshiftBytes(4)).toEqualArray(new Uint8Array([0x88, 0xee, 0x11, 0x33]));
            });

            test('should return a shared array if requested', function () {
                websock._receiveData(new Uint8Array([0xab, 0xcd, 0x12, 0x34,
                                                     0x88, 0xee, 0x11, 0x33]));
                const bytes = sock.rQshiftBytes(4, false);
                expect(bytes).toEqualArray(new Uint8Array([0xab, 0xcd, 0x12, 0x34]));
                expect(bytes.buffer.byteLength).not.toBe(bytes.length);
            });
        });

        describe('rQpeekBytes', function () {
            test('should not modify the receive queue', function () {
                websock._receiveData(new Uint8Array([0xab, 0xcd, 0x12, 0x34,
                                                     0x88, 0xee, 0x11, 0x33]));
                expect(sock.rQpeekBytes(4)).toEqualArray(new Uint8Array([0xab, 0xcd, 0x12, 0x34]));
                expect(sock.rQpeekBytes(4)).toEqualArray(new Uint8Array([0xab, 0xcd, 0x12, 0x34]));
            });

            test('should return a shared array if requested', function () {
                websock._receiveData(new Uint8Array([0xab, 0xcd, 0x12, 0x34,
                                                     0x88, 0xee, 0x11, 0x33]));
                const bytes = sock.rQpeekBytes(4, false);
                expect(bytes).toEqualArray(new Uint8Array([0xab, 0xcd, 0x12, 0x34]));
                expect(bytes.buffer.byteLength).not.toBe(bytes.length);
            });
        });

        describe('rQwait', function () {
            beforeEach(function () {
                websock._receiveData(new Uint8Array([0xab, 0xcd, 0x12, 0x34,
                                                     0x88, 0xee, 0x11, 0x33]));
            });

            test('should return true if there are not enough bytes in the receive queue', function () {
                expect(sock.rQwait('hi', 9)).toBe(true);
            });

            test('should return false if there are enough bytes in the receive queue', function () {
                expect(sock.rQwait('hi', 8)).toBe(false);
            });

            test('should return true and reduce rQi by "goback" if there are not enough bytes', function () {
                expect(sock.rQshift32()).toBe(0xabcd1234);
                expect(sock.rQwait('hi', 8, 2)).toBe(true);
                expect(sock.rQshift32()).toBe(0x123488ee);
            });

            test('should raise an error if we try to go back more than possible', function () {
                expect(sock.rQshift32()).toBe(0xabcd1234);
                expect(() => sock.rQwait('hi', 8, 6)).toThrow();
            });

            test('should not reduce rQi if there are enough bytes', function () {
                expect(sock.rQshift32()).toBe(0xabcd1234);
                expect(sock.rQwait('hi', 4, 2)).toBe(false);
                expect(sock.rQshift32()).toBe(0x88ee1133);
            });
        });
    });

    describe('Send queue methods', function () {
        let sock: any;

        const bufferSize = 10 * 1024;

        beforeEach(function () {
            let websock = new FakeWebSocket('ws://localhost');
            websock._open();
            sock = new Websock();
            sock.attach(websock as any);
        });

        describe('sQpush8()', function () {
            test('should send a single byte', function () {
                sock.sQpush8(42);
                sock.flush();
                expect(sock).toHaveSent(new Uint8Array([42]));
            });
            test('should not send any data until flushing', function () {
                sock.sQpush8(42);
                expect(sock).toHaveSent(new Uint8Array([]));
            });
            test('should implicitly flush if the queue is full', function () {
                for (let i = 0;i <= bufferSize;i++) {
                    sock.sQpush8(42);
                }

                let expected = [];
                for (let i = 0;i < bufferSize;i++) {
                    expected.push(42);
                }

                expect(sock).toHaveSent(new Uint8Array(expected));
            });
        });

        describe('sQpush16()', function () {
            test('should send a number as two bytes', function () {
                sock.sQpush16(420);
                sock.flush();
                expect(sock).toHaveSent(new Uint8Array([1, 164]));
            });
            test('should not send any data until flushing', function () {
                sock.sQpush16(420);
                expect(sock).toHaveSent(new Uint8Array([]));
            });
            test('should implicitly flush if the queue is full', function () {
                for (let i = 0;i <= bufferSize/2;i++) {
                    sock.sQpush16(420);
                }

                let expected = [];
                for (let i = 0;i < bufferSize/2;i++) {
                    expected.push(1);
                    expected.push(164);
                }

                expect(sock).toHaveSent(new Uint8Array(expected));
            });
        });

        describe('sQpush32()', function () {
            test('should send a number as two bytes', function () {
                sock.sQpush32(420420);
                sock.flush();
                expect(sock).toHaveSent(new Uint8Array([0, 6, 106, 68]));
            });
            test('should not send any data until flushing', function () {
                sock.sQpush32(420420);
                expect(sock).toHaveSent(new Uint8Array([]));
            });
            test('should implicitly flush if the queue is full', function () {
                for (let i = 0;i <= bufferSize/4;i++) {
                    sock.sQpush32(420420);
                }

                let expected = [];
                for (let i = 0;i < bufferSize/4;i++) {
                    expected.push(0);
                    expected.push(6);
                    expected.push(106);
                    expected.push(68);
                }

                expect(sock).toHaveSent(new Uint8Array(expected));
            });
        });

        describe('sQpushString()', function () {
            test('should send a string buffer', function () {
                sock.sQpushString('\x12\x34\x56\x78\x90');
                sock.flush();
                expect(sock).toHaveSent(new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x90]));
            });
            test('should not send any data until flushing', function () {
                sock.sQpushString('\x12\x34\x56\x78\x90');
                expect(sock).toHaveSent(new Uint8Array([]));
            });
            test('should implicitly flush if the queue is full', function () {
                for (let i = 0;i <= bufferSize/5;i++) {
                    sock.sQpushString('\x12\x34\x56\x78\x90');
                }

                let expected = [];
                for (let i = 0;i < bufferSize/5;i++) {
                    expected.push(0x12);
                    expected.push(0x34);
                    expected.push(0x56);
                    expected.push(0x78);
                    expected.push(0x90);
                }

                expect(sock).toHaveSent(new Uint8Array(expected));
            });
            test('should implicitly split a large buffer', function () {
                let str = '';
                let expected = [];
                for (let i = 0;i < bufferSize * 3;i++) {
                    let byte = Math.random() * 0xff;
                    str += String.fromCharCode(byte);
                    expected.push(byte);
                }

                sock.sQpushString(str);
                sock.flush();

                expect(sock).toHaveSent(new Uint8Array(expected));
            });
        });

        describe('sQpushBytes()', function () {
            test('should send a byte buffer', function () {
                sock.sQpushBytes(new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x90]));
                sock.flush();
                expect(sock).toHaveSent(new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x90]));
            });
            test('should not send any data until flushing', function () {
                sock.sQpushBytes(new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x90]));
                expect(sock).toHaveSent(new Uint8Array([]));
            });
            test('should implicitly flush if the queue is full', function () {
                for (let i = 0;i <= bufferSize/5;i++) {
                    sock.sQpushBytes(new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x90]));
                }

                let expected = [];
                for (let i = 0;i < bufferSize/5;i++) {
                    expected.push(0x12);
                    expected.push(0x34);
                    expected.push(0x56);
                    expected.push(0x78);
                    expected.push(0x90);
                }

                expect(sock).toHaveSent(new Uint8Array(expected));
            });
            test('should implicitly split a large buffer', function () {
                let buffer = [];
                let expected = [];
                for (let i = 0;i < bufferSize * 3;i++) {
                    let byte = Math.random() * 0xff;
                    buffer.push(byte);
                    expected.push(byte);
                }

                sock.sQpushBytes(new Uint8Array(buffer));
                sock.flush();

                expect(sock).toHaveSent(new Uint8Array(expected));
            });
        });

        describe('flush', function () {
            test('should actually send on the websocket', function () {
                sock._sQ = new Uint8Array([1, 2, 3]);
                sock._sQlen = 3;

                sock.flush();
                expect(sock).toHaveSent(new Uint8Array([1, 2, 3]));
            });

            test('should not call send if we do not have anything queued up', function () {
                sock._sQlen = 0;

                sock.flush();

                expect(sock).toHaveSent(new Uint8Array([]));
            });
        });
    });

    describe('lifecycle methods', function () {
        let oldWS: any;
        beforeAll(function () {
            oldWS = WebSocket;
        });

        let sock: any;
        let wsSpy: any;
        beforeEach(function () {
            sock = new Websock();
            // We need to replace the global WebSocket with a spy that wraps FakeWebSocket
            wsSpy = mock((...args: any[]) => new (FakeWebSocket as any)(...args));
            globalThis.WebSocket = wsSpy;
            // Copy static properties
            wsSpy.OPEN = FakeWebSocket.OPEN;
            wsSpy.CONNECTING = FakeWebSocket.CONNECTING;
            wsSpy.CLOSING = FakeWebSocket.CLOSING;
            wsSpy.CLOSED = FakeWebSocket.CLOSED;
        });

        describe('opening', function () {
            test('should pick the correct protocols if none are given', function () {

            });

            test('should open the actual websocket', function () {
                sock.open('ws://localhost:8675', 'binary');
                expect(wsSpy).toHaveBeenCalledWith('ws://localhost:8675', 'binary');
            });

            // it('should initialize the event handlers')?
        });

        describe('attaching', function () {
            test('should attach to an existing websocket', function () {
                let ws = new FakeWebSocket('ws://localhost:8675');
                sock.attach(ws);
                expect(wsSpy).not.toHaveBeenCalled();
            });
        });

        describe('closing', function () {
            beforeEach(function () {
                sock.open('ws://localhost');
                sock._websocket.close = mock(() => {});
            });

            test('should close the actual websocket if it is open', function () {
                sock._websocket.readyState = WebSocket.OPEN;
                sock.close();
                expect(sock._websocket.close).toHaveBeenCalledTimes(1);
            });

            test('should close the actual websocket if it is connecting', function () {
                sock._websocket.readyState = WebSocket.CONNECTING;
                sock.close();
                expect(sock._websocket.close).toHaveBeenCalledTimes(1);
            });

            test('should not try to close the actual websocket if closing', function () {
                sock._websocket.readyState = WebSocket.CLOSING;
                sock.close();
                expect(sock._websocket.close).not.toHaveBeenCalled();
            });

            test('should not try to close the actual websocket if closed', function () {
                sock._websocket.readyState = WebSocket.CLOSED;
                sock.close();
                expect(sock._websocket.close).not.toHaveBeenCalled();
            });

            test('should reset onmessage to not call _recvMessage', function () {
                const recvSpy = spyOn(sock, '_recvMessage');
                sock.close();
                sock._websocket.onmessage(null);
                expect(recvSpy).not.toHaveBeenCalled();
                recvSpy.mockRestore();
            });
        });

        describe('event handlers', function () {
            beforeEach(function () {
                sock._recvMessage = mock(() => {});
                sock.on('open', mock(() => {}));
                sock.on('close', mock(() => {}));
                sock.on('error', mock(() => {}));
                sock.open('ws://localhost');
            });

            test('should call _recvMessage on a message', function () {
                sock._websocket.onmessage(null);
                expect(sock._recvMessage).toHaveBeenCalledTimes(1);
            });

            test('should call the open event handler on opening', function () {
                sock._websocket.onopen();
                expect(sock._eventHandlers.open).toHaveBeenCalledTimes(1);
            });

            test('should call the close event handler on closing', function () {
                sock._websocket.onclose();
                expect(sock._eventHandlers.close).toHaveBeenCalledTimes(1);
            });

            test('should call the error event handler on error', function () {
                sock._websocket.onerror();
                expect(sock._eventHandlers.error).toHaveBeenCalledTimes(1);
            });
        });

        describe('ready state', function () {
            test('should be "unused" after construction', function () {
                let sock = new Websock();
                expect(sock.readyState).toBe('unused');
            });

            test('should be "connecting" if WebSocket is connecting', function () {
                let sock = new Websock();
                let ws: any = new FakeWebSocket('ws://localhost');
                ws.readyState = WebSocket.CONNECTING;
                sock.attach(ws);
                expect(sock.readyState).toBe('connecting');
            });

            test('should be "open" if WebSocket is open', function () {
                let sock = new Websock();
                let ws: any = new FakeWebSocket('ws://localhost');
                ws.readyState = WebSocket.OPEN;
                sock.attach(ws);
                expect(sock.readyState).toBe('open');
            });

            test('should be "closing" if WebSocket is closing', function () {
                let sock = new Websock();
                let ws: any = new FakeWebSocket('ws://localhost');
                ws.readyState = WebSocket.CLOSING;
                sock.attach(ws);
                expect(sock.readyState).toBe('closing');
            });

            test('should be "closed" if WebSocket is closed', function () {
                let sock = new Websock();
                let ws: any = new FakeWebSocket('ws://localhost');
                ws.readyState = WebSocket.CLOSED;
                sock.attach(ws);
                expect(sock.readyState).toBe('closed');
            });

            test('should be "unknown" if WebSocket state is unknown', function () {
                let sock = new Websock();
                let ws: any = new FakeWebSocket('ws://localhost');
                ws.readyState = 666;
                sock.attach(ws);
                expect(sock.readyState).toBe('unknown');
            });

            test('should be "connecting" if RTCDataChannel is connecting', function () {
                let sock = new Websock();
                let ws: any = new FakeWebSocket('ws://localhost');
                ws.readyState = 'connecting';
                sock.attach(ws);
                expect(sock.readyState).toBe('connecting');
            });

            test('should be "open" if RTCDataChannel is open', function () {
                let sock = new Websock();
                let ws: any = new FakeWebSocket('ws://localhost');
                ws.readyState = 'open';
                sock.attach(ws);
                expect(sock.readyState).toBe('open');
            });

            test('should be "closing" if RTCDataChannel is closing', function () {
                let sock = new Websock();
                let ws: any = new FakeWebSocket('ws://localhost');
                ws.readyState = 'closing';
                sock.attach(ws);
                expect(sock.readyState).toBe('closing');
            });

            test('should be "closed" if RTCDataChannel is closed', function () {
                let sock = new Websock();
                let ws: any = new FakeWebSocket('ws://localhost');
                ws.readyState = 'closed';
                sock.attach(ws);
                expect(sock.readyState).toBe('closed');
            });

            test('should be "unknown" if RTCDataChannel state is unknown', function () {
                let sock = new Websock();
                let ws: any = new FakeWebSocket('ws://localhost');
                ws.readyState = 'foobar';
                sock.attach(ws);
                expect(sock.readyState).toBe('unknown');
            });
        });

        afterAll(function () {
            // eslint-disable-next-line no-global-assign
            globalThis.WebSocket = oldWS;
        });
    });

    describe('WebSocket receiving', function () {
        let sock: any;
        beforeEach(function () {
            sock = new Websock();
            sock._allocateBuffers();
        });

        test('should support adding data to the receive queue', function () {
            const msg = { data: new Uint8Array([1, 2, 3]) };
            sock._recvMessage(msg);
            expect(sock.rQshiftStr(3)).toBe('\x01\x02\x03');
        });

        test('should call the message event handler if present', function () {
            sock._eventHandlers.message = mock(() => {});
            const msg = { data: new Uint8Array([1, 2, 3]).buffer };
            sock._mode = 'binary';
            sock._recvMessage(msg);
            expect(sock._eventHandlers.message).toHaveBeenCalledTimes(1);
        });

        test('should not call the message event handler if there is nothing in the receive queue', function () {
            sock._eventHandlers.message = mock(() => {});
            const msg = { data: new Uint8Array([]).buffer };
            sock._mode = 'binary';
            sock._recvMessage(msg);
            expect(sock._eventHandlers.message).not.toHaveBeenCalled();
        });

        test('should compact the receive queue when fully read', function () {
            sock._rQ = new Uint8Array([0, 1, 2, 3, 4, 5, 0, 0, 0, 0]);
            sock._rQlen = 6;
            sock._rQi = 6;
            const msg = { data: new Uint8Array([1, 2, 3]).buffer };
            sock._recvMessage(msg);
            expect(sock._rQlen).toBe(3);
            expect(sock._rQi).toBe(0);
        });

        test('should compact the receive queue when we reach the end of the buffer', function () {
            sock._rQ = new Uint8Array(20);
            sock._rQbufferSize = 20;
            sock._rQlen = 20;
            sock._rQi = 10;
            const msg = { data: new Uint8Array([1, 2]).buffer };
            sock._recvMessage(msg);
            expect(sock._rQlen).toBe(12);
            expect(sock._rQi).toBe(0);
        });

        test('should automatically resize the receive queue if the incoming message is larger than the buffer', function () {
            sock._rQ = new Uint8Array(20);
            sock._rQlen = 0;
            sock._rQi = 0;
            sock._rQbufferSize = 20;
            const msg = { data: new Uint8Array(30).buffer };
            sock._recvMessage(msg);
            expect(sock._rQlen).toBe(30);
            expect(sock._rQi).toBe(0);
            expect(sock._rQ.length).toBe(240);  // keep the invariant that rQbufferSize / 8 >= rQlen
        });

        test('should automatically resize the receive queue if the incoming message is larger than 1/8th of the buffer and we reach the end of the buffer', function () {
            sock._rQ = new Uint8Array(20);
            sock._rQlen = 16;
            sock._rQi = 15;
            sock._rQbufferSize = 20;
            const msg = { data: new Uint8Array(6).buffer };
            sock._recvMessage(msg);
            expect(sock._rQlen).toBe(7);
            expect(sock._rQi).toBe(0);
            expect(sock._rQ.length).toBe(56);
        });
    });
});
