# Integrating noVNC into a Bun Project

## Quick Answer

**Bun natively understands TypeScript**, so you can import noVNC source files directly — no build step needed.

```ts
import RFB from "./path/to/novnc/core/rfb.ts";
```

## Installation

Add noVNC as a dependency via git:

```bash
# From a GitHub fork/repo
bun add github:jakub-gordian/noVNC

# Or as a local path dependency in package.json
{
  "dependencies": {
    "@novnc/novnc": "file:../novnc"
  }
}
```

## Usage

### Headless / Server-Side (Bun Runtime)

If you only need the WebSocket protocol layer (e.g. to build a VNC proxy or
protocol parser), you can import the core modules directly:

```ts
import Websock from "@novnc/novnc/core/websock.ts";
import { encodings } from "@novnc/novnc/core/encodings.ts";
import type { RFBCredentials, RFBOptions, ConnectionState } from "@novnc/novnc/core/types.ts";
```

> **Note:** `RFB` and `Display` require a DOM environment (they create canvas
> elements, listen for keyboard/mouse events, etc.). For server-side use, stick
> to the lower-level modules like `Websock`, encodings, and crypto.

### Browser / DOM (The Primary Use Case)

noVNC is designed to run in the browser. The main entry point is the `RFB` class:

```ts
import RFB from "@novnc/novnc/core/rfb.ts";
import type { RFBCredentials, RFBOptions } from "@novnc/novnc/core/types.ts";

// The target element where the VNC canvas will be rendered
const container = document.getElementById("vnc-container")!;

// Connect to a VNC server via WebSocket
const rfb = new RFB(container, "ws://localhost:6080/websockify", {
    credentials: { password: "secret" } as RFBCredentials,
    shared: true,
    scaleViewport: true,
    resizeSession: true,
});

// Events
rfb.addEventListener("connect", () => {
    console.log("Connected to VNC server");
});

rfb.addEventListener("disconnect", (e: CustomEvent) => {
    console.log("Disconnected:", e.detail.clean ? "clean" : "unexpected");
});

rfb.addEventListener("credentialsrequired", () => {
    const password = prompt("VNC Password:");
    rfb.sendCredentials({ password });
});

rfb.addEventListener("desktopname", (e: CustomEvent) => {
    console.log("Desktop name:", e.detail.name);
});

rfb.addEventListener("clipboard", (e: CustomEvent) => {
    console.log("Clipboard from server:", e.detail.text);
});
```

### Constructor

```ts
new RFB(target: HTMLElement, urlOrChannel: string | WebSocket | RTCDataChannel, options?: RFBOptions)
```

| Parameter | Description |
|-----------|-------------|
| `target` | DOM element to render the VNC session into |
| `urlOrChannel` | WebSocket URL (`ws://` or `wss://`), or an existing `WebSocket`/`RTCDataChannel` |
| `options` | Optional configuration (see below) |

### Options (`RFBOptions`)

```ts
interface RFBOptions {
    shared?: boolean;           // Share the connection (default: true)
    credentials?: RFBCredentials; // { username?, password?, target? }
    repeaterID?: string;        // UltraVNC repeater ID
    wsProtocols?: string[];     // WebSocket sub-protocols
    showDotCursor?: boolean;    // Show dot when cursor is hidden
    clipViewport?: boolean;     // Clip to container size
    dragViewport?: boolean;     // Drag to scroll clipped viewport
    scaleViewport?: boolean;    // Scale to fit container
    resizeSession?: boolean;    // Request server resize on container change
    qualityLevel?: number;      // JPEG quality 0-9 (default: 6)
    compressionLevel?: number;  // Compression 0-9 (default: 2)
}
```

### Properties (Read/Write)

| Property | Type | Description |
|----------|------|-------------|
| `viewOnly` | `boolean` | Disable input to the remote session |
| `focusOnClick` | `boolean` | Auto-focus on click/touch (default: true) |
| `clipViewport` | `boolean` | Clip remote session to container |
| `dragViewport` | `boolean` | Drag to pan clipped viewport |
| `scaleViewport` | `boolean` | Scale to fit container |
| `resizeSession` | `boolean` | Request server-side resize |
| `showDotCursor` | `boolean` | Show dot cursor when server hides cursor |
| `background` | `string` | CSS background for the container |
| `qualityLevel` | `number` | JPEG quality (0-9) |
| `compressionLevel` | `number` | Compression level (0-9) |

### Properties (Read-Only)

| Property | Type | Description |
|----------|------|-------------|
| `capabilities` | `{ power: boolean }` | Server capabilities |
| `clippingViewport` | `boolean` | Whether viewport is currently clipped |

### Methods

| Method | Description |
|--------|-------------|
| `disconnect()` | Disconnect from the server |
| `sendCredentials(creds)` | Send `{ username?, password?, target? }` |
| `sendCtrlAltDel()` | Send Ctrl+Alt+Del key sequence |
| `machineShutdown()` | Request machine shutdown (requires `power` capability) |
| `machineReboot()` | Request machine reboot |
| `machineReset()` | Request machine reset |
| `clipboardPasteFrom(text)` | Send clipboard text to server |
| `focus()` | Focus the VNC canvas |
| `blur()` | Blur the VNC canvas |

### Events

| Event | `e.detail` | Description |
|-------|-----------|-------------|
| `connect` | `{}` | Connected to server |
| `disconnect` | `{ clean: boolean }` | Disconnected |
| `credentialsrequired` | `{ types: string[] }` | Server needs credentials |
| `securityfailure` | `{ status, reason }` | Authentication failed |
| `clipboard` | `{ text: string }` | Clipboard data from server |
| `bell` | — | Server bell |
| `desktopname` | `{ name: string }` | Desktop name received |
| `desktopsize` | `{ width, height }` | Desktop resized |
| `capabilities` | `{ capabilities }` | Server capabilities updated |

## H.264 Support Detection

noVNC detects WebCodecs H.264 decode support **lazily** — the check runs
asynchronously when `RFB` is constructed and updates a module-level flag before
encoding negotiation. This avoids top-level `await` in `core/util/browser.ts`,
which would break bundlers that cannot handle top-level await in transitive
dependencies (including Bun's HTML bundler).

If you need to check H.264 support yourself (e.g. for UI hints), import and
await the check function:

```ts
import { checkWebCodecsH264DecodeSupport } from "@novnc/novnc/core/util/browser.ts";

const hasH264 = await checkWebCodecsH264DecodeSupport();
console.log("H.264 decode supported:", hasH264);
```

The result is cached — once it resolves to `true`, subsequent calls return
immediately. You do **not** need to call this before constructing `RFB`; the
constructor handles it automatically.

## Serving to the Browser

Since browsers cannot load `.ts` files directly, you need one of these approaches:

### Option A: Bun Dev Server (Development)

This repo includes a dev server that transpiles `.ts` on-the-fly and proxies
WebSocket connections to a VNC server:

```bash
VNC_PORT=5901 bun run dev
# Open http://localhost:6080/vnc.html
```

### Option B: Bundle with Bun (Production)

Build a single JS bundle for browser consumption:

```bash
bun build core/rfb.ts --outfile dist/novnc.js --format esm --minify
```

Then in your HTML:
```html
<script type="module">
  import RFB from "./dist/novnc.js";
  const rfb = new RFB(document.getElementById("screen"), "ws://...");
</script>
```

### Option C: Use Your App's Bundler

If your Bun project uses a bundler (Vite, esbuild, etc.), just import the
`.ts` source directly — the bundler handles transpilation:

```ts
// In your app's source code — your bundler resolves and transpiles this
import RFB from "@novnc/novnc/core/rfb.ts";
```

## WebSocket Proxying

The VNC protocol runs over TCP. Browsers can only use WebSockets. You need a
proxy layer between the browser and the VNC server. Options:

| Approach | Description |
|----------|-------------|
| `bun run dev` | Built-in dev server with WS→TCP proxy |
| `websockify` | Standard Python-based proxy (`pip install websockify`) |
| Custom Bun server | Use `Bun.serve()` with WebSocket upgrade + `net.connect()` |
| Docker | `ghcr.io/novnc/websockify` container |

### Minimal Bun WebSocket Proxy

```ts
import { serve } from "bun";
import { connect } from "net";

serve({
    port: 6080,
    fetch(req, server) {
        if (req.headers.get("upgrade") === "websocket") {
            server.upgrade(req);
            return;
        }
        return new Response("Not found", { status: 404 });
    },
    websocket: {
        open(ws) {
            const tcp = connect(5901, "localhost");
            tcp.on("data", (data) => ws.sendBinary(data));
            tcp.on("close", () => ws.close());
            (ws as any)._tcp = tcp;
        },
        message(ws, msg) {
            (ws as any)._tcp?.write(Buffer.from(msg));
        },
        close(ws) {
            (ws as any)._tcp?.destroy();
        },
    },
});
```
