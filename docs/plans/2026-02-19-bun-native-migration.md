# Bun-Native Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate noVNC from Node.js/npm/Karma/Babel/Browserify to a fully Bun-native stack with TypeScript.

**Architecture:** Three-phase migration: (1) replace build tooling with Bun, (2) migrate test runner from Karma/Mocha/Chai/Sinon to `bun test`, (3) convert all JS source files to TypeScript. Each phase is independently verifiable.

**Tech Stack:** Bun (package manager, bundler, test runner, runtime), TypeScript, happy-dom, @napi-rs/canvas, typescript-eslint

---

## Phase 1: Build Tooling Migration

### Task 1: Initialize Bun and Create bunfig.toml

**Files:**
- Create: `bunfig.toml`
- Modify: `package.json`

**Step 1: Initialize Bun lockfile**

Run: `bun install`
Expected: Creates `bun.lockb`, installs dependencies

**Step 2: Create bunfig.toml**

```toml
# bunfig.toml

[test]
preload = ["happy-dom"]
root = "./tests"
```

**Step 3: Commit**

```bash
git add bunfig.toml bun.lockb
git commit -m "chore: initialize Bun package manager and config"
```

---

### Task 2: Clean Up package.json Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Remove legacy devDependencies and update scripts**

Remove these devDependencies:
- `@babel/core`
- `@babel/preset-env`
- `babel-plugin-import-redirect`
- `browserify`
- `chai`
- `jsdom`
- `karma`
- `karma-mocha`
- `karma-chrome-launcher`
- `@chiragrupani/karma-chromium-edge-launcher`
- `karma-firefox-launcher`
- `karma-ie-launcher`
- `karma-mocha-reporter`
- `karma-safari-launcher`
- `karma-script-launcher`
- `mocha`
- `sinon`
- `sinon-chai`
- `commander`
- `fs-extra`

Keep these devDependencies:
- `eslint`
- `globals`
- `pofile` (used by `po/po2js`)

Update scripts to:
```json
{
  "scripts": {
    "test": "bun test",
    "lint": "eslint app core po/po2js po/xgettext-html tests utils",
    "typecheck": "tsc --noEmit"
  }
}
```

Remove the `"browser": "lib/rfb"` field (the `lib/` directory was a CommonJS build artifact).

**Step 2: Add new devDependencies**

Run:
```bash
bun add -d @napi-rs/canvas typescript typescript-eslint happy-dom
```

**Step 3: Verify install**

Run: `bun install`
Expected: Clean install, no errors

**Step 4: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: remove legacy Node.js/Karma deps, add Bun-native deps"
```

---

### Task 3: Remove Legacy Config Files

**Files:**
- Delete: `karma.conf.js`
- Delete: `utils/convert.js`

**Step 1: Delete legacy files**

```bash
rm karma.conf.js utils/convert.js
```

**Step 2: Verify lint still runs**

Run: `bun run lint`
Expected: Linting passes (same results as before)

**Step 3: Commit**

```bash
git add -u karma.conf.js utils/convert.js
git commit -m "chore: remove Karma config and CommonJS converter"
```

---

## Phase 2: Test Runner Migration

### Task 4: Create Bun Test Infrastructure

**Files:**
- Rewrite: `tests/assertions.js` → new Bun-compatible test helpers
- Modify: `tests/fake.websocket.js` (no Chai/Sinon dependency changes needed — it's pure JS)

**Step 1: Rewrite assertions.js as test-helpers.js**

Replace `tests/assertions.js` with `tests/test-helpers.js`:

```javascript
// tests/test-helpers.js
// Custom matchers for bun:test's expect

import { expect } from "bun:test";

expect.extend({
    toHaveDisplayed(display, targetData, cmp) {
        const _equal = (a, b) => a === b;
        const comparator = cmp || _equal;
        const ctx = display._target.getContext('2d');
        const data = ctx.getImageData(0, 0, display._target.width, display._target.height).data;

        if (data.length !== targetData.length) {
            return {
                pass: false,
                message: () => `Display size mismatch: expected ${targetData.length} bytes, got ${data.length}`,
            };
        }

        let same = true;
        for (let i = 0; i < data.length; i++) {
            if (!comparator(data[i], targetData[i])) {
                same = false;
                break;
            }
        }

        return {
            pass: same,
            message: () => same
                ? `Expected display not to match target data`
                : `Expected display to match target data`,
        };
    },

    toHaveSent(rfb, targetData) {
        const data = rfb._websocket._getSentData();
        let same = true;
        if (data.length !== targetData.length) {
            same = false;
        } else {
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== targetData[i]) {
                    same = false;
                    break;
                }
            }
        }

        return {
            pass: same,
            message: () => same
                ? `Expected RFB not to have sent ${Array.from(targetData)}`
                : `Expected RFB to have sent ${Array.from(targetData)}, but got ${Array.from(data)}`,
        };
    },

    toEqualArray(received, expected) {
        let same = true;
        if (received.length !== expected.length) {
            same = false;
        } else {
            for (let i = 0; i < received.length; i++) {
                if (received[i] !== expected[i]) {
                    same = false;
                    break;
                }
            }
        }

        return {
            pass: same,
            message: () => same
                ? `Expected arrays not to be equal`
                : `Expected arrays to be equal`,
        };
    },
});
```

**Step 2: Verify the helper loads without errors**

Run: `bun -e "import './tests/test-helpers.js'; console.log('OK')"`
Expected: Prints "OK"

**Step 3: Commit**

```bash
git add tests/test-helpers.js
git commit -m "feat: add Bun-compatible test helper matchers"
```

---

### Task 5: Migrate Pure Logic Tests

These tests have no DOM or Canvas dependencies.

**Files:**
- Modify: `tests/test.base64.js`
- Modify: `tests/test.int.js`
- Modify: `tests/test.deflator.js`
- Modify: `tests/test.inflator.js`
- Modify: `tests/test.helper.js`

**Step 1: Migrate test.base64.js (example pattern for all pure logic tests)**

Transform from Chai to Bun syntax. The key replacements are:

| Chai (before) | Bun (after) |
|---|---|
| `expect(x).to.equal(y)` | `expect(x).toBe(y)` |
| `expect(x).to.deep.equal(y)` | `expect(x).toEqual(y)` |
| `expect(() => fn()).to.throw(Error)` | `expect(() => fn()).toThrow(Error)` |
| `expect(x).to.be.true` | `expect(x).toBe(true)` |
| `expect(x).to.be.false` | `expect(x).toBe(false)` |
| `expect(x).to.be.null` | `expect(x).toBeNull()` |
| `expect(x).to.be.undefined` | `expect(x).toBeUndefined()` |
| `expect(x).to.have.length(n)` | `expect(x).toHaveLength(n)` |
| `expect(x).to.be.an.instanceof(Y)` | `expect(x).toBeInstanceOf(Y)` |
| `expect(x).to.be.above(n)` | `expect(x).toBeGreaterThan(n)` |
| `expect(x).to.be.at.least(n)` | `expect(x).toBeGreaterThanOrEqual(n)` |
| `expect(x).to.contain(y)` | `expect(x).toContain(y)` |
| `expect(x).to.be.closeTo(y, delta)` | `expect(x).toBeCloseTo(y, decimal)` |
| `expect(spy).to.have.been.calledOnce` | `expect(spy).toHaveBeenCalledTimes(1)` |
| `expect(spy).to.have.been.calledWith(x)` | `expect(spy).toHaveBeenCalledWith(x)` |
| `expect(spy).to.not.have.been.called` | `expect(spy).not.toHaveBeenCalled()` |

Also:
- Remove the `import` of assertions.js (it was auto-loaded by Karma)
- Add `import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from "bun:test";` at the top
- Replace `it(` with `test(` (or keep `it` — Bun supports both, but `test` is idiomatic)
- Remove `"use strict";` declarations (unnecessary in ES modules)
- Replace `sinon.spy()` with `mock(() => {})` or `spyOn(obj, 'method')`
- Replace `sinon.stub(obj, 'method').returns(val)` with `spyOn(obj, 'method').mockReturnValue(val)`
- Replace `sinon.useFakeTimers()` with Bun's `jest.useFakeTimers()` — note: in `bun:test`, use `import { jest } from "bun:test"` then `jest.useFakeTimers()`
- Replace `clock.tick(ms)` with `jest.advanceTimersByTime(ms)`
- Replace `sinon.stub(obj, 'method').callsFake(fn)` with `spyOn(obj, 'method').mockImplementation(fn)`

Example — `test.base64.js` becomes:

```javascript
import { describe, expect, test } from "bun:test";
import Base64 from '../core/base64.js';

describe('Base64 tools', () => {
    const BIN_ARR = new Array(256);
    for (let i = 0; i < 256; i++) {
        BIN_ARR[i] = i;
    }

    const B64_STR = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==";

    describe('encode', () => {
        test('should encode a binary string into Base64', () => {
            const encoded = Base64.encode(BIN_ARR);
            expect(encoded).toBe(B64_STR);
        });
    });

    describe('decode', () => {
        test('should decode a Base64 string into a normal string', () => {
            const decoded = Base64.decode(B64_STR);
            expect(decoded).toEqual(BIN_ARR);
        });

        test('should throw an error if we have extra characters at the end', () => {
            expect(() => Base64.decode(B64_STR + 'abcdef')).toThrow(Error);
        });
    });
});
```

**Step 2: Migrate the remaining pure logic tests**

Apply the same transformation to:
- `tests/test.int.js`
- `tests/test.deflator.js`
- `tests/test.inflator.js`
- `tests/test.helper.js`

Follow the Chai-to-Bun mapping table above.

**Step 3: Run tests to verify they pass**

Run: `bun test tests/test.base64.js tests/test.int.js tests/test.deflator.js tests/test.inflator.js tests/test.helper.js`
Expected: All tests pass

**Step 4: Commit**

```bash
git add tests/test.base64.js tests/test.int.js tests/test.deflator.js tests/test.inflator.js tests/test.helper.js
git commit -m "test: migrate pure logic tests to bun test"
```

---

### Task 6: Migrate DOM-Only Tests

These tests need `document`, `window`, `HTMLElement` but NOT Canvas.

**Files:**
- Modify: `tests/test.keyboard.js`
- Modify: `tests/test.gesturehandler.js`
- Modify: `tests/test.websock.js`
- Modify: `tests/test.localization.js`
- Modify: `tests/test.webutil.js`
- Modify: `tests/test.browser.js`
- Modify: `tests/test.util.js`

**Step 1: Migrate test.websock.js (example pattern for DOM tests)**

Key differences from pure logic tests:
- DOM globals (`document`, `window`) are provided by happy-dom preload in bunfig.toml
- FakeWebSocket import stays the same (it's pure JS)
- Replace `sinon.spy()` / `sinon.stub()` with `spyOn()` / `mock()`

Example transformation for a sinon spy pattern:

Before:
```javascript
sock.onmessage = sinon.spy();
// ... later
expect(sock.onmessage).to.have.been.calledOnce;
```

After:
```javascript
const onmessage = mock(() => {});
sock.onmessage = onmessage;
// ... later
expect(onmessage).toHaveBeenCalledTimes(1);
```

Before (fake timers):
```javascript
clock = sinon.useFakeTimers();
// ...
clock.tick(2000);
// ...
clock.restore();
```

After:
```javascript
import { jest } from "bun:test";
jest.useFakeTimers();
// ...
jest.advanceTimersByTime(2000);
// ... in afterEach:
jest.useRealTimers();
```

Before (done callback for async):
```javascript
it('should do something', function (done) {
    sock.onopen = () => {
        expect(sock.protocol).to.equal('binary');
        done();
    };
    websock._open();
});
```

After (return a promise or use async/await):
```javascript
test('should do something', () => {
    return new Promise((resolve) => {
        sock.onopen = () => {
            expect(sock.protocol).toBe('binary');
            resolve();
        };
        websock._open();
    });
});
```

**Step 2: Migrate remaining DOM tests**

Apply transformations to: `test.keyboard.js`, `test.gesturehandler.js`, `test.localization.js`, `test.webutil.js`, `test.browser.js`, `test.util.js`

Note for `test.keyboard.js`: Uses `document.createElement`, `KeyboardEvent`, and `sinon.spy()` extensively. The happy-dom preload provides these.

**Step 3: Run tests to verify**

Run: `bun test tests/test.websock.js tests/test.keyboard.js tests/test.gesturehandler.js tests/test.localization.js tests/test.webutil.js tests/test.browser.js tests/test.util.js`
Expected: All tests pass

**Step 4: Commit**

```bash
git add tests/test.websock.js tests/test.keyboard.js tests/test.gesturehandler.js tests/test.localization.js tests/test.webutil.js tests/test.browser.js tests/test.util.js
git commit -m "test: migrate DOM-only tests to bun test"
```

---

### Task 7: Set Up Canvas Polyfill for Tests

**Files:**
- Create: `tests/canvas-setup.js`
- Modify: `bunfig.toml`

**Step 1: Create canvas setup file**

The `@napi-rs/canvas` package provides `createCanvas`, `ImageData`, etc. We need to polyfill `document.createElement('canvas')` to return a `@napi-rs/canvas` instance, and make `ImageData` globally available.

```javascript
// tests/canvas-setup.js
import { createCanvas, ImageData as NativeImageData } from "@napi-rs/canvas";

// Make ImageData available globally if happy-dom doesn't provide it
if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = NativeImageData;
}

// Patch document.createElement to return real canvas for 'canvas' elements
const origCreateElement = document.createElement.bind(document);
document.createElement = function (tagName, options) {
    if (tagName.toLowerCase() === 'canvas') {
        return createCanvas(0, 0);
    }
    return origCreateElement(tagName, options);
};
```

Note: The exact polyfill may need adjustment depending on how `@napi-rs/canvas` API maps to the HTML Canvas API. The canvas returned by `createCanvas()` should support `getContext('2d')`, `width`/`height` properties, and `toDataURL()`. Test this carefully.

**Step 2: Add canvas-setup to bunfig.toml preload**

```toml
[test]
preload = ["happy-dom", "./tests/canvas-setup.js"]
root = "./tests"
```

**Step 3: Verify canvas is available in test environment**

Run: `bun -e "import './tests/canvas-setup.js'; const c = document.createElement('canvas'); c.width = 4; c.height = 4; const ctx = c.getContext('2d'); console.log('Canvas OK:', !!ctx);"`
Expected: Prints "Canvas OK: true"

**Step 4: Commit**

```bash
git add tests/canvas-setup.js bunfig.toml
git commit -m "test: add canvas polyfill for non-browser test environment"
```

---

### Task 8: Migrate Canvas-Dependent Tests (Decoders)

**Files:**
- Modify: `tests/test.display.js`
- Modify: `tests/test.raw.js`
- Modify: `tests/test.copyrect.js`
- Modify: `tests/test.hextile.js`
- Modify: `tests/test.rre.js`
- Modify: `tests/test.tight.js`
- Modify: `tests/test.tightpng.js`
- Modify: `tests/test.zrle.js`
- Modify: `tests/test.zlib.js`
- Modify: `tests/test.jpeg.js`
- Modify: `tests/test.h264.js`

**Step 1: Migrate test.display.js (example pattern for Canvas tests)**

Same Chai-to-Bun transformations as before, plus:
- Import `test-helpers.js` for the custom `toHaveDisplayed` matcher
- Replace `expect(display).to.have.displayed(data)` with `expect(display).toHaveDisplayed(data)`
- Replace `expect(display).to.have.displayed(data, cmp)` with `expect(display).toHaveDisplayed(data, cmp)`

Example transformation:

Before:
```javascript
import Base64 from '../core/base64.js';
import Display from '../core/display.js';

describe('Display/Canvas helper', function () {
    // ...
    it('should take viewport into consideration', function () {
        display.drawImage(makeImageCanvas(basicData, 4, 1), 1, 1);
        display.flip();
        expect(display).to.have.displayed(expected);
    });
});
```

After:
```javascript
import { describe, expect, test, beforeEach } from "bun:test";
import "../tests/test-helpers.js";
import Base64 from '../core/base64.js';
import Display from '../core/display.js';

describe('Display/Canvas helper', () => {
    // ...
    test('should take viewport into consideration', () => {
        display.drawImage(makeImageCanvas(basicData, 4, 1), 1, 1);
        display.flip();
        expect(display).toHaveDisplayed(expected);
    });
});
```

**Step 2: Migrate remaining decoder tests**

Apply the same transformations to all decoder test files. Most decoder tests follow a similar pattern:
- Create a Display instance
- Feed encoded data through a decoder
- Verify the display shows the expected pixel data

**Step 3: Run tests**

Run: `bun test tests/test.display.js tests/test.raw.js tests/test.copyrect.js tests/test.hextile.js tests/test.rre.js tests/test.tight.js tests/test.tightpng.js tests/test.zrle.js tests/test.zlib.js tests/test.jpeg.js tests/test.h264.js`
Expected: All tests pass

**Step 4: Commit**

```bash
git add tests/test.display.js tests/test.raw.js tests/test.copyrect.js tests/test.hextile.js tests/test.rre.js tests/test.tight.js tests/test.tightpng.js tests/test.zrle.js tests/test.zlib.js tests/test.jpeg.js tests/test.h264.js
git commit -m "test: migrate canvas-dependent decoder tests to bun test"
```

---

### Task 9: Migrate test.rfb.js (The Big One)

**Files:**
- Modify: `tests/test.rfb.js` (5,499 lines)

This is the largest and most complex test file. It uses:
- Canvas and Display
- FakeWebSocket
- Sinon fake timers extensively
- Sinon spies/stubs heavily
- Custom `sent()` and `displayed()` assertions
- pako compression library
- ResizeObserver mock
- DOM events

**Step 1: Migrate imports and setup**

Replace:
```javascript
// Remove implicit Chai/Sinon globals from assertions.js
```

Add:
```javascript
import { describe, expect, test, beforeEach, afterEach, mock, spyOn, jest } from "bun:test";
import "../tests/test-helpers.js";
```

**Step 2: Replace sinon patterns**

Key replacements specific to test.rfb.js:

Before:
```javascript
let clock;
clock = sinon.useFakeTimers();
clock.tick(ms);
clock.restore();
```

After:
```javascript
jest.useFakeTimers();
jest.advanceTimersByTime(ms);
jest.useRealTimers();
```

Before:
```javascript
window.ResizeObserver = class FakeResizeObserver { ... };
// restore:
window.ResizeObserver = realObserver;
```

After (same pattern works — happy-dom provides `window`):
```javascript
// Same approach works, no change needed
```

Before:
```javascript
sinon.spy(client._display, 'resize');
expect(client._display.resize).to.have.been.calledOnce;
expect(client._display.resize).to.have.been.calledWith(240, 20);
```

After:
```javascript
const resizeSpy = spyOn(client._display, 'resize');
expect(resizeSpy).toHaveBeenCalledTimes(1);
expect(resizeSpy).toHaveBeenCalledWith(240, 20);
```

Before:
```javascript
expect(client).to.have.sent(expectedData);
```

After:
```javascript
expect(client).toHaveSent(expectedData);
```

**Step 3: Migrate the file systematically**

Work through the file in sections:
1. Imports and helper functions (lines 1-100) — mostly unchanged
2. Setup/teardown (beforeEach/afterEach) — replace sinon timers/spies
3. Connection tests — replace assertion syntax
4. Authentication tests — replace assertion syntax
5. Protocol message tests — replace assertion syntax
6. Encoding tests — replace Canvas assertions
7. Input/event tests — replace spy assertions

**Step 4: Run tests**

Run: `bun test tests/test.rfb.js`
Expected: All tests pass

**Step 5: Commit**

```bash
git add tests/test.rfb.js
git commit -m "test: migrate rfb protocol tests to bun test"
```

---

### Task 10: Remove Old Test Infrastructure and Verify Full Suite

**Files:**
- Delete: `tests/assertions.js` (replaced by `tests/test-helpers.js`)

**Step 1: Delete old assertions file**

```bash
rm tests/assertions.js
```

**Step 2: Run the full test suite**

Run: `bun test`
Expected: All 24 test files pass

**Step 3: Commit**

```bash
git add -u tests/assertions.js
git commit -m "chore: remove old Chai assertion helpers, full bun test suite passing"
```

---

## Phase 3: TypeScript Migration

### Task 11: Set Up TypeScript Configuration

**Files:**
- Create: `tsconfig.json`
- Modify: `eslint.config.mjs`
- Modify: `package.json`

**Step 1: Create tsconfig.json**

```json
{
    "compilerOptions": {
        "strict": true,
        "target": "ESNext",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "lib": ["ESNext", "DOM", "DOM.Iterable"],
        "noEmit": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "resolveJsonModule": true,
        "isolatedModules": true,
        "allowJs": true,
        "checkJs": false
    },
    "include": [
        "core/**/*.ts",
        "core/**/*.js",
        "app/**/*.ts",
        "app/**/*.js",
        "tests/**/*.ts",
        "tests/**/*.js"
    ],
    "exclude": [
        "node_modules",
        "vendor",
        "lib",
        "utils"
    ]
}
```

Note: `allowJs: true` and `checkJs: false` allows JS and TS files to coexist during migration.

**Step 2: Update eslint.config.mjs for TypeScript**

Add TypeScript-ESLint support. The config needs to handle both `.js` and `.ts` files during the migration period:

```javascript
import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.es2022,
            }
        },
        ignores: ["**/xtscancodes.js", "**/xtscancodes.ts"],
        rules: {
            // Unsafe or confusing stuff that we forbid
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", { "vars": "all",
                                                              "args": "none",
                                                              "ignoreRestSiblings": true,
                                                              "caughtErrors": "none" }],
            "no-constant-condition": ["error", { "checkLoops": false }],
            "no-var": "error",
            "no-useless-constructor": "off",
            "@typescript-eslint/no-useless-constructor": "error",
            "object-shorthand": ["error", "methods", { "avoidQuotes": true }],
            "prefer-arrow-callback": "error",
            "arrow-body-style": ["error", "as-needed", { "requireReturnForObjectLiteral": false }],
            "arrow-parens": ["error", "as-needed", { "requireForBlockBody": true }],
            "arrow-spacing": ["error"],
            "no-confusing-arrow": ["error", { "allowParens": true }],

            // Enforced coding style
            "brace-style": ["error", "1tbs", { "allowSingleLine": true }],
            "indent": ["error", 4, { "SwitchCase": 1,
                                     "VariableDeclarator": "first",
                                     "FunctionDeclaration": { "parameters": "first" },
                                     "FunctionExpression": { "parameters": "first" },
                                     "CallExpression": { "arguments": "first" },
                                     "ArrayExpression": "first",
                                     "ObjectExpression": "first",
                                     "ImportDeclaration": "first",
                                     "ignoreComments": true }],
            "comma-spacing": ["error"],
            "comma-style": ["error"],
            "curly": ["error", "multi-line"],
            "func-call-spacing": ["error"],
            "func-names": ["error"],
            "func-style": ["error", "declaration", { "allowArrowFunctions": true }],
            "key-spacing": ["error"],
            "keyword-spacing": ["error"],
            "no-trailing-spaces": ["error"],
            "semi": ["error"],
            "space-before-blocks": ["error"],
            "space-before-function-paren": ["error", { "anonymous": "always",
                                                       "named": "never",
                                                       "asyncArrow": "always" }],
            "switch-colon-spacing": ["error"],
            "camelcase": ["error", { "allow": ["^XK_", "^XF86XK_"] }],
            "no-console": ["error"],
        }
    },
    {
        files: ["po/po2js", "po/xgettext-html"],
        languageOptions: {
            globals: {
                ...globals.node,
            }
        },
        rules: {
            "no-console": 0,
        },
    },
    {
        files: ["tests/*"],
        languageOptions: {
            globals: {
                ...globals.node,
            }
        },
        rules: {
            "prefer-arrow-callback": 0,
            "func-names": "off",
        },
    },
    {
        files: ["utils/*"],
        languageOptions: {
            globals: {
                ...globals.node,
            }
        },
        rules: {
            "no-console": 0,
        },
    },
);
```

**Step 3: Verify typecheck and lint work**

Run: `bun run typecheck`
Expected: Passes (JS files are included but not type-checked due to `checkJs: false`)

Run: `bun run lint`
Expected: Passes

**Step 4: Commit**

```bash
git add tsconfig.json eslint.config.mjs package.json
git commit -m "chore: add TypeScript config and update ESLint for TS support"
```

---

### Task 12: Migrate Leaf Node Utilities to TypeScript

**Files to rename `.js` → `.ts`:**
- `core/util/logging.js`
- `core/util/int.js`
- `core/util/strings.js`
- `core/util/element.js`
- `core/util/events.js`
- `core/util/eventtarget.js`
- `core/encodings.js`

These files have zero or minimal internal dependencies and are the foundation of the codebase.

**Step 1: Rename files**

```bash
cd /Users/jklapacz/dev/novnc
for f in core/util/logging.js core/util/int.js core/util/strings.js core/util/element.js core/util/events.js core/util/eventtarget.js core/encodings.js; do
    git mv "$f" "${f%.js}.ts"
done
```

**Step 2: Add `// @ts-nocheck` to each file temporarily**

Add `// @ts-nocheck` as the first line of each renamed file. This keeps the build green while we add types incrementally.

**Step 3: Update imports across the codebase**

Bun resolves `.ts` extensions, but imports in other files still reference `.js`. Two options:
- **Option A:** Update all import paths to use `.ts` extensions
- **Option B (recommended):** Remove extensions from imports entirely — Bun resolves extensionless imports

For each file that imports the renamed modules, update the import path. For example, in files that import `'./logging.js'`, change to `'./logging.js'` → `'./logging.ts'` (or remove the extension).

Note: Since the HTML files (`vnc.html`, etc.) load modules directly in the browser, and browsers require `.js` extensions, we should keep `.js` extensions in imports and configure `tsconfig.json` with `"allowImportingTsExtensions": true`. Alternatively, since this is a clean break, we can update the HTML files to reference `.ts` files and rely on Bun's bundler for production builds. Decide based on whether the HTML files need to work without a build step.

**Step 4: Verify**

Run: `bun run typecheck`
Expected: Passes

Run: `bun test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: migrate leaf utility modules to TypeScript"
```

---

### Task 13: Migrate Second-Wave Modules to TypeScript

**Files to rename `.js` → `.ts`:**
- `core/base64.js` (depends on: `util/logging`)
- `core/deflator.js` (depends on: vendor pako)
- `core/inflator.js` (depends on: vendor pako)
- `core/util/browser.js` (depends on: `util/logging`, `base64`)
- `core/util/cursor.js` (depends on: `util/browser`)
- `core/crypto/md5.js` (leaf)
- `core/crypto/aes.js` (leaf)
- `core/crypto/des.js` (leaf)
- `core/crypto/bigint.js` (leaf)
- `core/crypto/rsa.js` (depends on: `base64`, `crypto/bigint`)
- `core/crypto/dh.js` (depends on: `crypto/bigint`)

**Step 1: Rename files**

```bash
cd /Users/jklapacz/dev/novnc
for f in core/base64.js core/deflator.js core/inflator.js core/util/browser.js core/util/cursor.js core/crypto/md5.js core/crypto/aes.js core/crypto/des.js core/crypto/bigint.js core/crypto/rsa.js core/crypto/dh.js; do
    git mv "$f" "${f%.js}.ts"
done
```

**Step 2: Add `// @ts-nocheck` to each file**

**Step 3: Update imports**

**Step 4: Verify**

Run: `bun run typecheck && bun test`
Expected: Both pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: migrate base64, inflator, deflator, browser, cursor, crypto to TypeScript"
```

---

### Task 14: Migrate Third-Wave Modules to TypeScript

**Files to rename `.js` → `.ts`:**
- `core/crypto/crypto.js` (depends on: all crypto modules)
- `core/input/keysym.js` (leaf)
- `core/input/vkeys.js` (leaf)
- `core/input/fixedkeys.js` (leaf)
- `core/input/domkeytable.js` (depends on: `keysym`)
- `core/input/keysymdef.js` (depends on: `keysym`)
- `core/input/xtscancodes.js` (leaf)
- `core/input/util.js` (depends on: `keysym`, `keysymdef`, `vkeys`, `fixedkeys`, `domkeytable`, `browser`)
- `core/decoders/copyrect.js` (leaf)
- `core/decoders/jpeg.js` (leaf)
- `core/decoders/rre.js` (leaf)
- `core/decoders/raw.js` (depends on: `util/logging`)
- `core/decoders/hextile.js` (depends on: `util/logging`)
- `core/decoders/h264.js` (depends on: `util/logging`)
- `core/decoders/tight.js` (depends on: `util/logging`, `inflator`)
- `core/decoders/tightpng.js` (depends on: `tight`)
- `core/decoders/zlib.js` (depends on: `inflator`)
- `core/decoders/zrle.js` (depends on: `inflator`)

**Step 1: Rename files**

```bash
cd /Users/jklapacz/dev/novnc
for f in core/crypto/crypto.js core/input/keysym.js core/input/vkeys.js core/input/fixedkeys.js core/input/domkeytable.js core/input/keysymdef.js core/input/xtscancodes.js core/input/util.js core/decoders/copyrect.js core/decoders/jpeg.js core/decoders/rre.js core/decoders/raw.js core/decoders/hextile.js core/decoders/h264.js core/decoders/tight.js core/decoders/tightpng.js core/decoders/zlib.js core/decoders/zrle.js; do
    git mv "$f" "${f%.js}.ts"
done
```

**Step 2: Add `// @ts-nocheck` to each file**

**Step 3: Update imports**

**Step 4: Verify**

Run: `bun run typecheck && bun test`
Expected: Both pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: migrate crypto, input, and decoder modules to TypeScript"
```

---

### Task 15: Migrate Core Infrastructure to TypeScript

**Files to rename `.js` → `.ts`:**
- `core/websock.js` (depends on: `util/logging`)
- `core/input/keyboard.js` (depends on: `util/logging`, `util/events`, `input/util`, `input/keysym`, `util/browser`)
- `core/input/gesturehandler.js` (leaf)
- `core/display.js` (depends on: `util/logging`, `base64`, `util/int`)
- `core/ra2.js` (depends on: `util/strings`, `util/eventtarget`, `crypto/crypto`)

**Step 1: Rename files**

```bash
cd /Users/jklapacz/dev/novnc
for f in core/websock.js core/input/keyboard.js core/input/gesturehandler.js core/display.js core/ra2.js; do
    git mv "$f" "${f%.js}.ts"
done
```

**Step 2: Add `// @ts-nocheck` to each file**

**Step 3: Update imports**

**Step 4: Verify**

Run: `bun run typecheck && bun test`
Expected: Both pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: migrate websock, keyboard, display, ra2 to TypeScript"
```

---

### Task 16: Migrate rfb.js to TypeScript

**Files:**
- Rename: `core/rfb.js` → `core/rfb.ts`

This is the largest file (3,498 lines) and imports from 24+ internal modules. By now, all its dependencies are already `.ts` files.

**Step 1: Rename file**

```bash
git mv core/rfb.js core/rfb.ts
```

**Step 2: Add `// @ts-nocheck` as the first line**

**Step 3: Update imports in files that import rfb**

The main consumer is `app/ui.js` — update its import path.

**Step 4: Verify**

Run: `bun run typecheck && bun test`
Expected: Both pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: migrate rfb.ts - main VNC protocol handler to TypeScript"
```

---

### Task 17: Migrate App Layer to TypeScript

**Files to rename `.js` → `.ts`:**
- `app/localization.js`
- `app/webutil.js`
- `app/error-handler.js`
- `app/ui.js` (3,326 lines — the other large file)

**Step 1: Rename files**

```bash
cd /Users/jklapacz/dev/novnc
for f in app/localization.js app/webutil.js app/error-handler.js app/ui.js; do
    git mv "$f" "${f%.js}.ts"
done
```

**Step 2: Add `// @ts-nocheck` to each file**

**Step 3: Update imports in HTML files**

The HTML entry points (`vnc.html`, `vnc_lite.html`, `demo_collector.html`) reference `app/ui.js` directly. Update these `<script>` tags to reference `.ts` (for Bun dev server) or plan to bundle for production.

**Step 4: Verify**

Run: `bun run typecheck && bun test`
Expected: Both pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: migrate app layer (ui, localization, webutil) to TypeScript"
```

---

### Task 18: Migrate Test Files to TypeScript

**Files to rename `.js` → `.ts`:**
- `tests/test-helpers.js` → `tests/test-helpers.ts`
- `tests/fake.websocket.js` → `tests/fake.websocket.ts`
- `tests/canvas-setup.js` → `tests/canvas-setup.ts`
- All 24 `tests/test.*.js` → `tests/test.*.ts`

**Step 1: Rename all test files**

```bash
cd /Users/jklapacz/dev/novnc
for f in tests/test-helpers.js tests/fake.websocket.js tests/canvas-setup.js tests/test.*.js; do
    git mv "$f" "${f%.js}.ts"
done
```

**Step 2: Add `// @ts-nocheck` to each file**

**Step 3: Update bunfig.toml preload paths**

```toml
[test]
preload = ["happy-dom", "./tests/canvas-setup.ts"]
root = "./tests"
```

**Step 4: Update imports within test files**

**Step 5: Verify**

Run: `bun run typecheck && bun test`
Expected: Both pass

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: migrate all test files to TypeScript"
```

---

### Task 19: Progressively Add Types (Ongoing)

This is the long-tail work of removing `// @ts-nocheck` from each file and adding real TypeScript types. This can be done incrementally over time.

**Recommended order:**
1. Start with leaf utilities (`core/util/int.ts`, `core/util/strings.ts`, `core/encodings.ts`) — small files, simple types
2. Move to crypto modules — well-defined interfaces
3. Then decoders — each has a similar shape
4. Then `core/display.ts` and `core/websock.ts`
5. Then `core/rfb.ts` — the big one
6. Finally `app/ui.ts`

**For each file:**
1. Remove `// @ts-nocheck`
2. Run `bun run typecheck` to see errors
3. Add types to fix errors (function signatures, class properties, interfaces)
4. Run `bun test` to verify nothing broke
5. Commit

This task is explicitly open-ended and can be spread across many sessions.

---

## Verification Checklist

After all phases are complete:

- [ ] `bun install` — clean install, no errors
- [ ] `bun test` — all 24 test files pass
- [ ] `bun run lint` — no lint errors
- [ ] `bun run typecheck` — no type errors (once @ts-nocheck is removed)
- [ ] No `karma`, `mocha`, `chai`, `sinon`, `babel`, or `browserify` references remain
- [ ] No `.js` source files remain in `core/` or `app/` (all `.ts`)
- [ ] `bunfig.toml` and `tsconfig.json` are present and correct
