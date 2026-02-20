#!/usr/bin/env bun
// Dev server for noVNC: serves static files, transpiles .ts on-the-fly,
// and proxies WebSocket connections to a VNC server.

import { serve, file } from "bun";
import { join, extname } from "path";
import { existsSync } from "fs";
import { connect } from "net";

const ROOT = import.meta.dir;
const PORT = parseInt(process.env.PORT || "6080");
const VNC_HOST = process.env.VNC_HOST || "localhost";
const VNC_PORT = parseInt(process.env.VNC_PORT || "5901");

const MIME_TYPES: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

serve({
    port: PORT,
    async fetch(req, server) {
        const url = new URL(req.url);
        let pathname = url.pathname === "/" ? "/vnc.html" : url.pathname;

        // WebSocket upgrade for VNC proxy
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
            const success = server.upgrade(req, { data: { path: pathname } });
            if (success) return undefined;
            return new Response("WebSocket upgrade failed", { status: 400 });
        }

        // Serve .ts files as transpiled JS
        if (pathname.endsWith(".ts")) {
            const filePath = join(ROOT, pathname);
            if (!existsSync(filePath)) {
                return new Response("Not found", { status: 404 });
            }
            const transpiler = new Bun.Transpiler({ loader: "ts" });
            const source = await Bun.file(filePath).text();
            let code = transpiler.transformSync(source);
            // Rewrite .ts imports to .js so the browser can chain-load them
            code = code.replace(
                /(from\s+['"])([^'"]+)\.ts(['"])/g,
                "$1$2.js$3"
            );
            return new Response(code, {
                headers: { "Content-Type": "application/javascript" },
            });
        }

        // Serve .js files (vendor/pako etc.)
        // Also handle requests for .js that should map to .ts source files
        if (pathname.endsWith(".js")) {
            const jsPath = join(ROOT, pathname);
            if (existsSync(jsPath)) {
                return new Response(file(jsPath), {
                    headers: { "Content-Type": "application/javascript" },
                });
            }
            // Try .ts fallback
            const tsPath = jsPath.replace(/\.js$/, ".ts");
            if (existsSync(tsPath)) {
                const transpiler = new Bun.Transpiler({ loader: "ts" });
                const source = await Bun.file(tsPath).text();
                let code = transpiler.transformSync(source);
                code = code.replace(
                    /(from\s+['"])([^'"]+)\.ts(['"])/g,
                    "$1$2.js$3"
                );
                return new Response(code, {
                    headers: { "Content-Type": "application/javascript" },
                });
            }
            return new Response("Not found", { status: 404 });
        }

        // Static files
        const filePath = join(ROOT, pathname);
        if (!existsSync(filePath)) {
            return new Response("Not found", { status: 404 });
        }
        const ext = extname(pathname);
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        return new Response(file(filePath), {
            headers: { "Content-Type": contentType },
        });
    },

    websocket: {
        open(ws) {
            // Open a TCP connection to the VNC server
            const tcp = connect(VNC_PORT, VNC_HOST, () => {
                console.log(`VNC proxy: connected to ${VNC_HOST}:${VNC_PORT}`);
            });

            tcp.on("data", (data: Buffer) => {
                ws.sendBinary(data);
            });

            tcp.on("close", () => {
                console.log("VNC proxy: TCP connection closed");
                ws.close();
            });

            tcp.on("error", (err: Error) => {
                console.error("VNC proxy error:", err.message);
                ws.close();
            });

            // Store the TCP socket on the ws for use in message/close handlers
            (ws as any)._vnc = tcp;
        },

        message(ws, message) {
            const tcp = (ws as any)._vnc;
            if (tcp && !tcp.destroyed) {
                if (typeof message === "string") {
                    tcp.write(Buffer.from(message));
                } else {
                    tcp.write(Buffer.from(message));
                }
            }
        },

        close(ws) {
            const tcp = (ws as any)._vnc;
            if (tcp && !tcp.destroyed) {
                tcp.destroy();
            }
            console.log("VNC proxy: WebSocket closed");
        },
    },
});

console.log(`noVNC dev server running at http://localhost:${PORT}/`);
console.log(`VNC proxy target: ${VNC_HOST}:${VNC_PORT}`);
console.log(`Open http://localhost:${PORT}/vnc.html to connect`);
