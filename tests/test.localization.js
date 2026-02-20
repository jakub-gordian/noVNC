import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";

import _, { Localizer, l10n } from '../app/localization.ts';

describe('Localization', function () {
    let origNavigator;
    let fetchSpy;

    beforeEach(function () {
        // window.navigator is a protected read-only property in many
        // environments, so we need to redefine it whilst running these
        // tests.
        origNavigator = Object.getOwnPropertyDescriptor(window, "navigator");

        Object.defineProperty(window, "navigator", {value: {}});
        window.navigator.languages = [];

        fetchSpy = spyOn(window, "fetch").mockResolvedValue(new Response("{}"));
    });
    afterEach(function () {
        fetchSpy.mockRestore();

        Object.defineProperty(window, "navigator", origNavigator);
    });

    describe('Singleton', function () {
        test('should export a singleton object', function () {
            expect(l10n).toBeInstanceOf(Localizer);
        });
        test('should export a singleton translation function', async function () {
            // FIXME: Can we use some spy instead?
            window.navigator.languages = ["de"];
            fetchSpy.mockResolvedValue(new Response(JSON.stringify({ "Foobar": "gazonk" })));
            await l10n.setup(["de"]);
            expect(_("Foobar")).toBe("gazonk");
        });
    });

    describe('language selection', function () {
        test('should use English by default', function () {
            let lclz = new Localizer();
            expect(lclz.language).toBe('en');
        });
        test('should use English if no user language matches', async function () {
            window.navigator.languages = ["nl", "de"];
            let lclz = new Localizer();
            await lclz.setup(["es", "fr"]);
            expect(lclz.language).toBe('en');
        });
        test('should fall back to generic English for other English', async function () {
            window.navigator.languages = ["en-AU", "de"];
            let lclz = new Localizer();
            await lclz.setup(["de", "fr", "en-GB"]);
            expect(lclz.language).toBe('en');
        });
        test('should prefer specific English over generic', async function () {
            window.navigator.languages = ["en-GB", "de"];
            let lclz = new Localizer();
            await lclz.setup(["de", "en-AU", "en-GB"]);
            expect(lclz.language).toBe('en-GB');
        });
        test('should use the most preferred user language', async function () {
            window.navigator.languages = ["nl", "de", "fr"];
            let lclz = new Localizer();
            await lclz.setup(["es", "fr", "de"]);
            expect(lclz.language).toBe('de');
        });
        test('should prefer sub-languages languages', async function () {
            window.navigator.languages = ["pt-BR"];
            let lclz = new Localizer();
            await lclz.setup(["pt", "pt-BR"]);
            expect(lclz.language).toBe('pt-BR');
        });
        test('should fall back to language "parents"', async function () {
            window.navigator.languages = ["pt-BR"];
            let lclz = new Localizer();
            await lclz.setup(["fr", "pt", "de"]);
            expect(lclz.language).toBe('pt');
        });
        test('should not use specific language when user asks for a generic language', async function () {
            window.navigator.languages = ["pt", "de"];
            let lclz = new Localizer();
            await lclz.setup(["fr", "pt-BR", "de"]);
            expect(lclz.language).toBe('de');
        });
        test('should handle underscore as a separator', async function () {
            window.navigator.languages = ["pt-BR"];
            let lclz = new Localizer();
            await lclz.setup(["pt_BR"]);
            expect(lclz.language).toBe('pt_BR');
        });
        test('should handle difference in case', async function () {
            window.navigator.languages = ["pt-br"];
            let lclz = new Localizer();
            await lclz.setup(["pt-BR"]);
            expect(lclz.language).toBe('pt-BR');
        });
    });

    describe('Translation loading', function () {
        test('should not fetch a translation for English', async function () {
            window.navigator.languages = [];
            let lclz = new Localizer();
            await lclz.setup([]);
            expect(fetchSpy).not.toHaveBeenCalled();
        });
        test('should fetch dictionary relative base URL', async function () {
            window.navigator.languages = ["de", "fr"];
            fetchSpy.mockResolvedValue(new Response('{ "Foobar": "gazonk" }'));
            let lclz = new Localizer();
            await lclz.setup(["ru", "fr"], "/some/path/");
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(fetchSpy).toHaveBeenCalledWith("/some/path/fr.json");
            expect(lclz.get("Foobar")).toBe("gazonk");
        });
        test('should handle base URL without trailing slash', async function () {
            window.navigator.languages = ["de", "fr"];
            fetchSpy.mockResolvedValue(new Response('{ "Foobar": "gazonk" }'));
            let lclz = new Localizer();
            await lclz.setup(["ru", "fr"], "/some/path");
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(fetchSpy).toHaveBeenCalledWith("/some/path/fr.json");
            expect(lclz.get("Foobar")).toBe("gazonk");
        });
        test('should handle current base URL', async function () {
            window.navigator.languages = ["de", "fr"];
            fetchSpy.mockResolvedValue(new Response('{ "Foobar": "gazonk" }'));
            let lclz = new Localizer();
            await lclz.setup(["ru", "fr"]);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(fetchSpy).toHaveBeenCalledWith("fr.json");
            expect(lclz.get("Foobar")).toBe("gazonk");
        });
        test('should fail if dictionary cannot be found', async function () {
            window.navigator.languages = ["de", "fr"];
            fetchSpy.mockResolvedValue(new Response('{}', { status: 404 }));
            let lclz = new Localizer();
            let ok = false;
            try {
                await lclz.setup(["ru", "fr"], "/some/path/");
            } catch (e) {
                ok = true;
            }
            expect(ok).toBe(true);
        });
    });
});
