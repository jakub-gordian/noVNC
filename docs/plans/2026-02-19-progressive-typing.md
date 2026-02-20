# Progressive TypeScript Typing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove `// @ts-nocheck` from all `.ts` files and add real TypeScript types, progressing from leaf modules inward.

**Architecture:** Bottom-up typing — start with leaf utilities that have no internal dependencies, then work inward through the dependency graph. Each file gets typed, verified, and committed independently. Shared interfaces live in a new `core/types.ts` file.

**Tech Stack:** TypeScript strict mode, Bun runtime, `tsc --noEmit` for verification

---

## Shared Types Foundation

### Task 1: Create core/types.ts with shared interfaces

**Files:**
- Create: `core/types.ts`

**Step 1: Create the shared types file**

```typescript
// core/types.ts
// Shared type definitions for noVNC

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';
export type LogFunction = (...args: unknown[]) => void;

export interface Position {
    x: number;
    y: number;
}

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface DamageBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export type RawChannel = WebSocket | RTCDataChannel;

export type ConnectionState = 'connecting' | 'connected' | 'disconnecting' | 'disconnected';

export interface RFBCredentials {
    username?: string;
    password?: string;
    target?: string;
}

export interface RFBOptions {
    shared?: boolean;
    credentials?: RFBCredentials;
    repeaterID?: string;
    wsProtocols?: string[];
    showDotCursor?: boolean;
    clipViewport?: boolean;
    dragViewport?: boolean;
    scaleViewport?: boolean;
    resizeSession?: boolean;
    qualityLevel?: number;
    compressionLevel?: number;
}

export interface Decoder {
    decodeRect(
        x: number,
        y: number,
        width: number,
        height: number,
        sock: unknown, // Websock - avoid circular import
        display: unknown, // Display - avoid circular import
        depth: number
    ): boolean | Promise<boolean>;
}

export interface WebsockEventHandlers {
    message: (() => void) | null;
    open: (() => void) | null;
    close: ((e: CloseEvent) => void) | null;
    error: ((e: Event) => void) | null;
}
```

**Step 2: Verify typecheck passes**

Run: `bun run typecheck`
Expected: Passes

**Step 3: Commit**

```bash
git add core/types.ts
git commit -m "feat: add shared TypeScript type definitions"
```

---

## Tier 1: Leaf Utilities

### Task 2: Type core/util/int.ts

**Files:**
- Modify: `core/util/int.ts`

**Step 1: Remove `// @ts-nocheck` and add types**

This file exports two simple number-to-number functions:

```typescript
export function toUnsigned32bit(toConvert: number): number {
    return toConvert >>> 0;
}

export function toSigned32bit(toConvert: number): number {
    return toConvert | 0;
}
```

**Step 2: Verify**

Run: `bun run typecheck && bun run test`
Expected: Both pass

**Step 3: Commit**

```bash
git add core/util/int.ts
git commit -m "types: add types to core/util/int.ts"
```

---

### Task 3: Type core/util/strings.ts

**Files:**
- Modify: `core/util/strings.ts`

**Step 1: Remove `// @ts-nocheck` and add types**

Two exported functions with string I/O:

```typescript
export function decodeUTF8(utf8string: string, allowLatin1: boolean = false): string {
    // ... body unchanged
}

export function encodeUTF8(DOMString: string): string {
    // ... body unchanged
}
```

The `decodeUTF8` function creates a custom Error with a `.name` property. No interface needed — just ensure the `try/catch` variable is typed as `unknown` and narrowed.

**Step 2: Verify**

Run: `bun run typecheck && bun run test`

**Step 3: Commit**

```bash
git add core/util/strings.ts
git commit -m "types: add types to core/util/strings.ts"
```

---

### Task 4: Type core/util/logging.ts

**Files:**
- Modify: `core/util/logging.ts`

**Step 1: Remove `// @ts-nocheck` and add types**

Uses module-level mutable state. Import the shared `LogLevel` and `LogFunction` types:

```typescript
import { LogLevel, LogFunction } from '../types.ts';

let _logLevel: LogLevel = 'warn';

let Debug: LogFunction = () => {};
let Info: LogFunction = () => {};
let Warn: LogFunction = () => {};
let Error: LogFunction = () => {};

function initLogging(level?: LogLevel): void {
    // ... switch statement body unchanged
}

function getLogging(): LogLevel {
    return _logLevel;
}

export { initLogging, getLogging, Debug, Info, Warn, Error };
```

**Gotcha:** The `let` exports are reassigned inside `initLogging`. TypeScript allows this for module-level `let` exports. The switch statement assigns `console.debug` etc. which matches `LogFunction` since console methods accept `...args: any[]`.

**Step 2: Verify**

Run: `bun run typecheck && bun run test`

**Step 3: Commit**

```bash
git add core/util/logging.ts
git commit -m "types: add types to core/util/logging.ts"
```

---

### Task 5: Type core/encodings.ts

**Files:**
- Modify: `core/encodings.ts`

**Step 1: Remove `// @ts-nocheck` and add types**

The encodings object can use `as const` for strong typing:

```typescript
export const encodings = {
    encodingRaw: 0,
    encodingCopyRect: 1,
    encodingRRE: 2,
    encodingHextile: 5,
    // ... all other entries
    pseudoEncodingCompressLevel0: -256,
    // ... etc
} as const;

export type EncodingType = typeof encodings[keyof typeof encodings];

export function encodingName(num: number): string {
    switch (num) {
        // ... cases unchanged
        default: return '[unknown encoding ' + num + ']';
    }
}
```

**Step 2: Verify**

Run: `bun run typecheck && bun run test`

**Step 3: Commit**

```bash
git add core/encodings.ts
git commit -m "types: add types to core/encodings.ts"
```

---

### Task 6: Type core/util/element.ts

**Files:**
- Modify: `core/util/element.ts`

**Step 1: Remove `// @ts-nocheck` and add types**

Single function with DOM types:

```typescript
import { Position } from '../types.ts';

export function clientToElement(x: number, y: number, elem: HTMLElement): Position {
    const bounds = elem.getBoundingClientRect();
    let pos: Position = {
        x: x - bounds.left,
        y: y - bounds.top,
    };
    // ... ratio calculations
    return pos;
}
```

**Step 2: Verify**

Run: `bun run typecheck && bun run test`

**Step 3: Commit**

```bash
git add core/util/element.ts
git commit -m "types: add types to core/util/element.ts"
```

---

### Task 7: Type core/util/eventtarget.ts

**Files:**
- Modify: `core/util/eventtarget.ts`

**Step 1: Remove `// @ts-nocheck` and add types**

```typescript
type EventCallback = (event: CustomEvent | Event) => void;

export default class EventTargetMixin {
    _listeners: Map<string, Set<EventCallback>>;

    constructor() {
        this._listeners = new Map();
    }

    addEventListener(type: string, callback: EventCallback): void {
        // ... body unchanged
    }

    removeEventListener(type: string, callback: EventCallback): void {
        // ... body unchanged
    }

    dispatchEvent(event: Event): boolean {
        // ... body unchanged
    }
}
```

**Gotcha:** The `event` parameter in `dispatchEvent` accesses `.type` and `.defaultPrevented` — both exist on the base `Event` interface.

**Step 2: Verify**

Run: `bun run typecheck && bun run test`

**Step 3: Commit**

```bash
git add core/util/eventtarget.ts
git commit -m "types: add types to core/util/eventtarget.ts"
```

---

### Task 8: Type core/util/events.ts

**Files:**
- Modify: `core/util/events.ts`

**Step 1: Remove `// @ts-nocheck` and add types**

This file uses non-standard DOM properties like `document.captureElement`. Needs a declaration merge:

```typescript
// At the top of the file, extend the Document interface
declare global {
    interface Document {
        captureElement?: Element | null;
    }
}

let _captureRecursion: boolean = false;
let _captureElem: Element | null = null;
let _captureObserver: MutationObserver | null = null;
let _elementForUnflushedEvents: Element | null = null;

export function getPointerEvent(e: MouseEvent | TouchEvent): MouseEvent | Touch {
    // ... body unchanged
}

export function stopEvent(e: Event): void {
    e.stopPropagation();
    e.preventDefault();
}

export function setCapture(target: Element): void {
    // ... body unchanged
}

export function releaseCapture(): void {
    // ... body unchanged
}
```

**Gotcha:** `getPointerEvent` checks `e.changedTouches` which only exists on `TouchEvent`. Use a type guard: `if ('changedTouches' in e)`.

**Step 2: Verify**

Run: `bun run typecheck && bun run test`

**Step 3: Commit**

```bash
git add core/util/events.ts
git commit -m "types: add types to core/util/events.ts"
```

---

## Tier 2: Mid-Level Modules

### Task 9: Type core/base64.ts

**Files:**
- Modify: `core/base64.ts`

**Step 1: Remove `// @ts-nocheck` and add types**

The default export is an object literal with methods. Type the internal arrays and the encode/decode signatures:

```typescript
export default {
    toBase64Table: 'ABCDE...'.split('') as string[],
    base64Pad: '=',
    toBinaryTable: [-1, -1, ...] as number[],

    encode(data: ArrayLike<number>): string {
        // ... body unchanged
    },

    decode(data: string, offset: number = 0): number[] {
        // ... body unchanged
    },
};
```

**Gotcha:** `encode` accepts anything array-like with numeric indices (`Uint8Array`, `number[]`, plain `Array`). Use `ArrayLike<number>` as the parameter type.

**Step 2: Verify**

Run: `bun run typecheck && bun run test`

**Step 3: Commit**

```bash
git add core/base64.ts
git commit -m "types: add types to core/base64.ts"
```

---

### Task 10: Type core/util/browser.ts

**Files:**
- Modify: `core/util/browser.ts`

**Step 1: Remove `// @ts-nocheck` and add types**

This file exports several browser-detection booleans and utility functions. Most are simple:

```typescript
export const isTouchDevice: boolean = ...;
export const dragThreshold: number = ...;
export const supportsCursorURIs: boolean = ...;
// etc.

export function isMac(): boolean { ... }
export function isWindows(): boolean { ... }
export function isIOS(): boolean { ... }
export function isAndroid(): boolean { ... }
export function isChromeOS(): boolean { ... }
export function isSafari(): boolean { ... }
export function isFirefox(): boolean { ... }
export function hasScrollbarGutter(): boolean { ... }
```

**Gotcha:** Some detection uses `navigator.platform` (deprecated) and feature checks that may need type assertions. Handle gracefully with optional chaining.

**Step 2: Verify**

Run: `bun run typecheck && bun run test`

**Step 3: Commit**

```bash
git add core/util/browser.ts
git commit -m "types: add types to core/util/browser.ts"
```

---

### Task 11: Type core/util/cursor.ts

**Files:**
- Modify: `core/util/cursor.ts`

**Step 1: Remove `// @ts-nocheck` and read the file first to understand the class/function structure**

This module handles cursor rendering. Read the full file before typing. Typical types needed: canvas element references, pixel data arrays, cursor position coordinates.

**Step 2: Add types based on actual code**

**Step 3: Verify**

Run: `bun run typecheck && bun run test`

**Step 4: Commit**

```bash
git add core/util/cursor.ts
git commit -m "types: add types to core/util/cursor.ts"
```

---

### Task 12: Type core/deflator.ts and core/inflator.ts

**Files:**
- Modify: `core/deflator.ts`
- Modify: `core/inflator.ts`

**Step 1: Remove `// @ts-nocheck` and add types to both**

Both wrap vendor/pako streams. Key types:
- Constructor takes buffer size: `constructor(bufferSize?: number)`
- Methods accept/return `Uint8Array`
- Internal `_strm` is a pako ZStream (use `any` for vendor type)

```typescript
// deflator.ts
export default class Deflator {
    _strm: any; // pako ZStream - vendor type
    _chunkSize: number;

    constructor(bufferSize?: number);
    deflate(inData: Uint8Array): Uint8Array;
}

// inflator.ts
export default class Inflator {
    _strm: any; // pako ZStream - vendor type
    _chunkSize: number;

    constructor(bufferSize?: number);
    inflate(data: Uint8Array, expected: number, flush?: boolean): Uint8Array;
    reset(): void;
}
```

**Gotcha:** The pako vendor library in `vendor/pako` has no type declarations. Use `any` for the ZStream internal and add a `// TODO: add vendor types` comment.

**Step 2: Verify**

Run: `bun run typecheck && bun run test`

**Step 3: Commit**

```bash
git add core/deflator.ts core/inflator.ts
git commit -m "types: add types to core/deflator.ts and core/inflator.ts"
```

---

### Task 13: Type core/crypto modules

**Files:**
- Modify: `core/crypto/md5.ts`
- Modify: `core/crypto/des.ts`
- Modify: `core/crypto/aes.ts`
- Modify: `core/crypto/bigint.ts`
- Modify: `core/crypto/rsa.ts`
- Modify: `core/crypto/dh.ts`
- Modify: `core/crypto/crypto.ts`

**Step 1: Read each file and understand the exports**

These are cryptographic implementations. Common patterns:
- Functions accept/return `Uint8Array` or `ArrayBuffer`
- Some use Web Crypto API (`SubtleCrypto`, `CryptoKey`)
- `bigint.ts` implements arbitrary-precision arithmetic
- `crypto.ts` is the facade that delegates to the others

**Step 2: Remove `// @ts-nocheck` from each and add types**

Start with leaf modules (md5, des, bigint) then work up to aes, rsa, dh, and finally crypto.

Key types:
- `md5.ts`: `export function MD5(data: Uint8Array): Uint8Array`
- `des.ts`: `export function DES(password: Uint8Array, challenge: Uint8Array): Uint8Array`
- `bigint.ts`: Large-number operations on `Uint8Array` representations
- `aes.ts`: Classes `AESECBCipher` and `AESEAXCipher` with async methods
- `rsa.ts`: RSA encryption using bigint operations
- `dh.ts`: Diffie-Hellman key exchange
- `crypto.ts`: Facade exporting all crypto primitives

**Step 3: Verify after each file**

Run: `bun run typecheck && bun run test`

**Step 4: Commit**

```bash
git add core/crypto/*.ts
git commit -m "types: add types to all core/crypto modules"
```

---

## Tier 3: Input and Decoders

### Task 14: Type core/input modules

**Files:**
- Modify: `core/input/keysym.ts`
- Modify: `core/input/vkeys.ts`
- Modify: `core/input/fixedkeys.ts`
- Modify: `core/input/domkeytable.ts`
- Modify: `core/input/keysymdef.ts`
- Modify: `core/input/xtscancodes.ts`
- Modify: `core/input/util.ts`
- Modify: `core/input/keyboard.ts`
- Modify: `core/input/gesturehandler.ts`

**Step 1: Read each file first**

Most input modules are lookup tables (keysym maps, key tables) that export `Record<string, number>` or similar. The complex ones are:
- `keyboard.ts`: Class with event handling, fake key tracking, compositing state
- `gesturehandler.ts`: Touch gesture recognition state machine
- `util.ts`: Utility functions for key lookup and resolution

**Step 2: Type leaf modules first (keysym, vkeys, fixedkeys, domkeytable, keysymdef, xtscancodes)**

These are mostly `export default { ... } as const` or `Record<string, number>`.

**Step 3: Type util.ts, then keyboard.ts and gesturehandler.ts**

Keyboard class needs:
```typescript
export default class Keyboard {
    _target: HTMLElement;
    _keyDownList: Record<string, number>;
    onkeyevent: ((keysym: number, code: string, down: boolean) => void) | null;
    // ... more properties
}
```

GestureHandler class needs:
```typescript
export default class GestureHandler {
    _target: HTMLElement;
    _state: string;
    // ... touch tracking state
}
```

**Step 4: Verify**

Run: `bun run typecheck && bun run test`

**Step 5: Commit**

```bash
git add core/input/*.ts
git commit -m "types: add types to all core/input modules"
```

---

### Task 15: Type core/decoders

**Files:**
- Modify: `core/decoders/copyrect.ts`
- Modify: `core/decoders/raw.ts`
- Modify: `core/decoders/rre.ts`
- Modify: `core/decoders/hextile.ts`
- Modify: `core/decoders/tight.ts`
- Modify: `core/decoders/tightpng.ts`
- Modify: `core/decoders/zlib.ts`
- Modify: `core/decoders/zrle.ts`
- Modify: `core/decoders/jpeg.ts`
- Modify: `core/decoders/h264.ts`

**Step 1: Define a shared Decoder interface**

All decoders follow a common pattern. Use the `Decoder` interface from `core/types.ts`, but with concrete types now that Websock and Display are available:

```typescript
// Add to core/types.ts or define locally
import type Websock from '../websock.ts';
import type Display from '../display.ts';

interface Decoder {
    decodeRect(
        x: number, y: number,
        width: number, height: number,
        sock: Websock,
        display: Display,
        depth: number
    ): boolean;
}
```

**Step 2: Type each decoder**

Most decoders are simple classes with:
- Internal state tracking (partial decode progress)
- A `decodeRect` method
- Pixel manipulation helpers

Start with the simplest (copyrect, rre) and work up to complex ones (tight, zrle, h264).

**Gotcha for h264.ts:** Uses WebCodecs API (`VideoDecoder`, `EncodedVideoChunk`). These types may need `/// <reference lib="dom" />` or be behind a feature check. May need conditional typing.

**Step 3: Verify**

Run: `bun run typecheck && bun run test`

**Step 4: Commit**

```bash
git add core/decoders/*.ts
git commit -m "types: add types to all core/decoders"
```

---

## Tier 4: Core Infrastructure

### Task 16: Type core/websock.ts

**Files:**
- Modify: `core/websock.ts`

**Step 1: Remove `// @ts-nocheck` and read the full file**

**Step 2: Add types**

Key types for the Websock class:

```typescript
import type { RawChannel, WebsockEventHandlers } from './types.ts';

export default class Websock {
    _websocket: WebSocket | null;
    _rQi: number;
    _rQlen: number;
    _rQbufferSize: number;
    _rQ: Uint8Array | null;
    _sQbufferSize: number;
    _sQlen: number;
    _sQ: Uint8Array | null;
    _eventHandlers: WebsockEventHandlers;

    constructor();

    // Getters
    get readyState(): string;

    // Receive queue
    rQpeek8(): number;
    rQshift8(): number;
    rQshift16(): number;
    rQshift32(): number;
    rQshiftStr(len: number): string;
    rQshiftBytes(len: number, copy?: boolean): Uint8Array;
    rQshiftTo(target: Uint8Array, len: number): void;
    rQpeekBytes(len: number, copy?: boolean): Uint8Array;
    rQwait(msg: string, num: number, goback?: number): boolean;

    // Send queue
    sQpush8(num: number): void;
    sQpush16(num: number): void;
    sQpush32(num: number): void;
    sQpushString(str: string): void;
    sQpushBytes(bytes: Uint8Array | ArrayLike<number>): void;
    flush(): void;

    // Connection
    open(uri: string, protocols?: string | string[]): void;
    attach(rawChannel: RawChannel): void;
    close(): void;
    init(): void;

    // Events
    on(evt: string, handler: (...args: unknown[]) => void): void;
    off(evt: string): void;
}
```

**Gotcha:** The `_websocket` field accepts both `WebSocket` and objects passed via `attach()`. The `readyState` getter maps WebSocket numeric states to string names.

**Step 3: Verify**

Run: `bun run typecheck && bun run test`

**Step 4: Commit**

```bash
git add core/websock.ts
git commit -m "types: add types to core/websock.ts"
```

---

### Task 17: Type core/display.ts

**Files:**
- Modify: `core/display.ts`

**Step 1: Remove `// @ts-nocheck` and read the full file**

**Step 2: Add types**

Key class properties and methods. The Display class manages a double-buffered canvas with a render queue:

```typescript
import type { Rect, DamageBounds } from './types.ts';

type RenderQueueEntry = {
    type: 'flip' | 'copy' | 'fill' | 'blit' | 'img';
    // fields vary by type — use discriminated union or loose object
    [key: string]: unknown;
};

export default class Display {
    _target: HTMLCanvasElement;
    _targetCtx: CanvasRenderingContext2D;
    _backbuffer: HTMLCanvasElement;
    _drawCtx: CanvasRenderingContext2D;
    _damageBounds: DamageBounds;
    _fbWidth: number;
    _fbHeight: number;
    _viewportLoc: Rect;
    _renderQ: RenderQueueEntry[];
    _flushPromise: Promise<void> | null;
    _scale: number;
    _clipViewport: boolean;

    constructor(target: HTMLCanvasElement);

    // Public API
    get scale(): number;
    set scale(val: number);
    get clipViewport(): boolean;
    set clipViewport(val: boolean);

    viewportChangePos(deltaX: number, deltaY: number): void;
    viewportChangeSize(width?: number, height?: number): void;
    absX(x: number): number;
    absY(y: number): number;

    resize(width: number, height: number): void;
    flip(fromQueue?: boolean): void;
    pending(): boolean;

    flush(): Promise<void>;
    fillRect(x: number, y: number, width: number, height: number, color: number[], fromQueue?: boolean): void;
    copyImage(oldX: number, oldY: number, newX: number, newY: number, w: number, h: number, fromQueue?: boolean): void;
    imageRect(x: number, y: number, width: number, height: number, mime: string, arr: Uint8Array): void;
    blitImage(x: number, y: number, width: number, height: number, arr: Uint8Array, offset: number, fromQueue?: boolean): void;
    drawImage(img: CanvasImageSource, x: number, y: number): void;

    autoscale(containerWidth: number, containerHeight: number): void;
}
```

**Step 3: Verify**

Run: `bun run typecheck && bun run test`

**Step 4: Commit**

```bash
git add core/display.ts
git commit -m "types: add types to core/display.ts"
```

---

### Task 18: Type core/ra2.ts

**Files:**
- Modify: `core/ra2.ts`

**Step 1: Read the file — this is the RSA-AES authentication handler**

**Step 2: Add types — mostly async methods dealing with crypto and binary data**

**Step 3: Verify**

Run: `bun run typecheck && bun run test`

**Step 4: Commit**

```bash
git add core/ra2.ts
git commit -m "types: add types to core/ra2.ts"
```

---

## Tier 5: The Big Ones

### Task 19: Type core/rfb.ts

**Files:**
- Modify: `core/rfb.ts` (3,498 lines)

This is the largest and most complex file. It manages the entire VNC protocol lifecycle.

**Step 1: Remove `// @ts-nocheck` and catalog all type errors**

Run: `bun run typecheck 2>&1 | grep "rfb.ts" | head -50`

Count the errors and categorize them.

**Step 2: Define RFB-specific types at the top of the file**

```typescript
import type { RFBOptions, RFBCredentials, ConnectionState, RawChannel } from './types.ts';
import type Websock from './websock.ts';
import type Display from './display.ts';

type RFBInitState = 'ProtocolVersion' | 'Security' | 'Authentication' | 'SecurityResult' | 'SecurityReason' | 'ClientInitialisation' | 'ServerInitialisation';

interface PixelFormat {
    bitsPerPixel: number;
    depth: number;
    bigEndian: boolean;
    trueColor: boolean;
    redMax: number;
    greenMax: number;
    blueMax: number;
    redShift: number;
    greenShift: number;
    blueShift: number;
}

interface FBUpdateRequest {
    incremental: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
}
```

**Step 3: Type class properties (there are 50+)**

Work through the constructor and add types to each property declaration. Group related properties:
- Connection state properties
- Protocol version properties
- Authentication properties
- Framebuffer properties
- Input state properties
- Decoder instances

**Step 4: Type methods section by section**

Work through methods in order:
1. Getters/setters (simple)
2. Connection management (_connect, _disconnect, etc.)
3. Authentication handlers (_negotiate*, _handle*)
4. Message handlers (_handleMsg, _framebufferUpdate, etc.)
5. Input handlers (_handleKeyEvent, _handlePointerEvent, etc.)
6. Encoding handlers (one per decoder type)

**Step 5: Verify frequently**

After each section, run: `bun run typecheck 2>&1 | grep "rfb.ts" | wc -l`
Track the error count going down.

**Step 6: Final verify**

Run: `bun run typecheck && bun run test`
Expected: Both pass with zero rfb.ts errors

**Step 7: Commit**

```bash
git add core/rfb.ts
git commit -m "types: add types to core/rfb.ts"
```

---

### Task 20: Type app/ui.ts

**Files:**
- Modify: `app/ui.ts` (3,326 lines)

**Step 1: Remove `// @ts-nocheck` and catalog errors**

**Step 2: Define UI-specific types**

```typescript
interface UISettings {
    host: string;
    port: string;
    path: string;
    encrypt: boolean;
    autoconnect: boolean;
    shared: boolean;
    viewOnly: boolean;
    clipViewport: boolean;
    dragViewport: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    showDotCursor: boolean;
    qualityLevel: number;
    compressionLevel: number;
    logging: string;
    repeaterID: string;
    reconnect: boolean;
    reconnectDelay: number;
}
```

**Step 3: Type the UI object/class**

The UI module is likely a large object literal or class with methods for:
- Connection management
- Settings/preferences
- Control bar toggling
- Clipboard handling
- Recording functionality
- Keyboard/mouse handling

**Step 4: Verify**

Run: `bun run typecheck && bun run test`

**Step 5: Commit**

```bash
git add app/ui.ts
git commit -m "types: add types to app/ui.ts"
```

---

### Task 21: Type app/ helper modules

**Files:**
- Modify: `app/localization.ts`
- Modify: `app/webutil.ts`
- Modify: `app/error-handler.ts`

**Step 1: Read and type each file**

These are simpler than ui.ts:
- `localization.ts`: String translation functions, language detection
- `webutil.ts`: URL parameter parsing, settings storage (localStorage)
- `error-handler.ts`: Global error/rejection handlers

**Step 2: Verify**

Run: `bun run typecheck && bun run test`

**Step 3: Commit**

```bash
git add app/localization.ts app/webutil.ts app/error-handler.ts
git commit -m "types: add types to app helper modules"
```

---

## Tier 6: Test Files (Optional)

### Task 22: Type test infrastructure files

**Files:**
- Modify: `tests/test-helpers.ts`
- Modify: `tests/fake.websocket.ts`
- Modify: `tests/canvas-setup.ts`

These are lower priority since test files benefit less from strict typing. Focus on the helpers and mocks that are imported by many test files.

**Step 1: Type fake.websocket.ts**

```typescript
export default class FakeWebSocket {
    protocol: string;
    readyState: number;
    binaryType: string;
    extensions: string;
    onopen: ((ev: Event) => void) | null;
    onmessage: ((ev: MessageEvent) => void) | null;
    onerror: ((ev: Event) => void) | null;
    onclose: ((ev: CloseEvent) => void) | null;

    static replace(): void;
    static restore(): void;

    send(data: ArrayBuffer | Uint8Array | string): void;
    close(code?: number, reason?: string): void;

    // Test helpers
    _getSentData(): Uint8Array;
    _open(): void;
    _receiveData(data: Uint8Array): void;
}
```

**Step 2: Verify**

Run: `bun run typecheck && bun run test`

**Step 3: Commit**

```bash
git add tests/test-helpers.ts tests/fake.websocket.ts tests/canvas-setup.ts
git commit -m "types: add types to test infrastructure files"
```

---

### Task 23: Type individual test files (ongoing)

**Files:**
- All 24 `tests/test.*.ts` files

This is truly optional and lowest priority. Test files are consumers of types, not producers. The `@ts-nocheck` can remain on test files indefinitely without impacting the quality of the core library typing.

If pursued, start with the simplest: `test.int.ts`, `test.base64.ts`, then work up.

---

## Verification Checklist

After all tasks are complete:

- [ ] `bun run typecheck` — zero errors
- [ ] `bun run test` — 593 pass, 42 skip, 0 fail
- [ ] `bun run lint` — no new lint errors
- [ ] No `// @ts-nocheck` remaining in `core/` or `app/`
- [ ] `core/types.ts` contains shared interfaces
- [ ] All function signatures have explicit parameter and return types
- [ ] All class properties have type annotations
