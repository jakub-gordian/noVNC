# Bun-Native Migration Design

## Summary

Migrate noVNC from a Node.js/npm/Karma/Babel/Browserify toolchain to a fully Bun-native stack: Bun as package manager, bundler, test runner, and runtime. Simultaneously convert all JavaScript source files to TypeScript. This is a clean break — no backward compatibility with npm/Node.js consumers.

## Approach

Phased migration in three distinct stages, each independently verifiable.

---

## Phase 1: Build Tooling Migration

Replace npm with Bun as the package manager and remove legacy build tools.

### Changes

1. **Package manager**: Generate `bun.lockb` via `bun install`, delete `package-lock.json` if present
2. **Add `bunfig.toml`** for Bun-specific configuration
3. **Update `package.json` scripts**:
   - `"test"` → `"bun test"`
   - `"lint"` → `"eslint app core po/po2js po/xgettext-html tests utils"`
   - Remove `"prepublish"` (CommonJS conversion no longer needed)
4. **Remove legacy config**: Delete `karma.conf.js`
5. **Remove legacy build script**: Delete or archive `utils/convert.js`
6. **Remove devDependencies**:
   - `@babel/core`, `@babel/preset-env`, `babel-plugin-import-redirect`
   - `browserify`
   - `karma`, `karma-mocha`, `karma-chrome-launcher`, `@chiragrupani/karma-chromium-edge-launcher`, `karma-firefox-launcher`, `karma-ie-launcher`, `karma-mocha-reporter`, `karma-safari-launcher`, `karma-script-launcher`
   - `mocha`, `chai`, `sinon`, `sinon-chai`
   - `jsdom`
   - `commander`, `fs-extra` (if unused after removing `convert.js`)

### What stays

- All source files in `core/`, `app/` untouched
- Python/bash utility scripts untouched
- ESLint config stays (already ESM-compatible)

### Verification

- `bun install` succeeds
- `bun run lint` passes
- Source files still load in browser (they're ES modules, no build step needed)

---

## Phase 2: Test Runner Migration

Migrate from Karma/Mocha/Chai/Sinon to `bun test`.

### Test Framework Changes

- Replace Mocha's `describe`/`it` with Bun's `describe`/`test` (Jest-compatible API)
- Replace Chai's `expect().to.equal()` with Bun's `expect().toBe()`/`expect().toEqual()`
- Replace Sinon spies/stubs with `bun:test`'s `mock()` and `spyOn()`
- Rewrite `tests/assertions.js` — convert custom Chai assertions (`.displayed()`, `.sent()`, `.array`) to Bun-compatible custom matchers via `expect.extend()`

### DOM Environment

- Add `[test] preload = ["happy-dom"]` to `bunfig.toml`
- Provides `document`, `window`, `HTMLElement`, etc.

### Canvas-Dependent Tests

`happy-dom` does not implement Canvas 2D API. Use `@napi-rs/canvas` as a polyfill for tests that need `canvas.getContext('2d')`, `ImageData`, `putImageData`.

### Test Categories

| Category | Count | DOM? | Canvas? | Examples |
|----------|-------|------|---------|----------|
| Pure logic | ~5 | No | No | base64, int, deflator, inflator, helper |
| DOM-only | ~8 | Yes | No | keyboard, gesturehandler, websock, localization, webutil, browser, util |
| Canvas | ~11 | Yes | Yes | display, rfb, raw, copyrect, hextile, tight, tightpng, rre, zrle, zlib, jpeg, h264 |

### Verification

- `bun test` runs all 24 test files
- Test count matches or exceeds the original Karma suite

---

## Phase 3: TypeScript Migration

Rename `.js` to `.ts` and add types. Bun runs TypeScript natively — `tsc` is used only for type-checking.

### Configuration

**`tsconfig.json`:**
- `"strict": true`
- `"target": "ESNext"`, `"module": "ESNext"`
- `"moduleResolution": "bundler"`
- `"lib": ["ESNext", "DOM", "DOM.Iterable"]`
- `"noEmit": true`

**New script:** `"typecheck": "tsc --noEmit"`

### Migration Order (leaves first)

1. **Utilities**: `core/util/*.ts`, `core/base64.ts`, `core/encodings.ts`
2. **Crypto**: `core/crypto/*.ts`
3. **Infrastructure**: `core/websock.ts`, `core/inflator.ts`, `core/deflator.ts`
4. **Input**: `core/input/*.ts`
5. **Decoders**: `core/decoders/*.ts`
6. **Display**: `core/display.ts`
7. **Core**: `core/rfb.ts`
8. **App**: `app/*.ts`
9. **Tests**: `tests/*.ts`

### Typing Approach

- Start with `// @ts-nocheck` on freshly renamed files to keep the build green
- Progressively remove `// @ts-nocheck` and add real types
- Add `.d.ts` declarations for vendor libraries (`vendor/pako`) if no `@types` exist

### ESLint Update

- Add `typescript-eslint` for TS-aware linting
- Update `eslint.config.mjs` to handle `.ts` files
- Keep existing style rules, add TS-specific ones

### Verification

- `bun run typecheck` passes (no type errors)
- `bun test` still passes
- `bun run lint` still passes

---

## Files Summary

### Removed
- `karma.conf.js`
- `utils/convert.js`
- `package-lock.json` (if present)

### Added
- `bunfig.toml`
- `bun.lockb` (generated)
- `tsconfig.json`

### Modified
- `package.json` — scripts, dependencies
- `eslint.config.mjs` — TypeScript support
- All `core/**/*.js` → `core/**/*.ts`
- All `app/*.js` → `app/*.ts`
- All `tests/test.*.js` → `tests/test.*.ts`
- All `tests/fake.*.js` → `tests/fake.*.ts`
- `tests/assertions.js` → `tests/assertions.ts` (rewritten)

### Dependencies Added
- `@napi-rs/canvas` — Canvas polyfill for tests
- `typescript` — type-checking
- `typescript-eslint` — TS-aware linting

### Dependencies Removed
- `@babel/core`, `@babel/preset-env`, `babel-plugin-import-redirect`
- `browserify`
- All `karma-*` packages
- `mocha`, `chai`, `sinon`, `sinon-chai`
- `jsdom`
- `commander`, `fs-extra`, `pofile` (if confirmed unused)

### Not Touched
- `utils/novnc_proxy` (bash)
- `utils/recording_server.py` (Python)
- `vendor/` (third-party)
- `vnc.html`, `vnc_lite.html`, `demo_collector.html` (HTML entry points)
- `docs/`, `snap/`, `po/`
