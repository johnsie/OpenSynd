// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { KEYS, LANGUAGES, applyTranslations, pickLanguage, translate } from "../src/i18n.js";

test("every key has a real translation in every language, and the languages are the ones the settings offer", () => {
  assert.deepEqual(Object.keys(LANGUAGES), ["en", "es", "fr"]);
  for (const key of KEYS) {
    const texts = Object.keys(LANGUAGES).map((language) => translate(language, key));
    assert.ok(texts.every((text) => text.trim().length > 0), key);
  }
  const differing = KEYS.filter((key) => translate("es", key) !== translate("en", key) && translate("fr", key) !== translate("en", key));
  assert.ok(differing.length >= KEYS.length - 4, "nearly everything is really translated (a few words, like Mission, are the same)");
  assert.equal(translate("es", "title.accept"), "Aceptar misión");
  assert.equal(translate("fr", "title.accept"), "Accepter la mission");
  assert.equal(translate("es", "title.begin"), "Comenzar misión");
  assert.equal(translate("fr", "title.begin"), "Commencer la mission");
});

test("unknown languages fall back to English and unknown keys come back as they are", () => {
  assert.equal(translate("de", "title.begin"), "Begin mission");
  assert.equal(translate("es", "no.such.key"), "no.such.key");
});

test("the browser's language list picks a supported language, else English", () => {
  assert.equal(pickLanguage(["es-MX", "en"]), "es");
  assert.equal(pickLanguage(["de-DE", "fr-CA"]), "fr");
  assert.equal(pickLanguage(["de", "ja"]), "en");
  assert.equal(pickLanguage([]), "en");
});

test("every key the page marks exists in the table, and every table key is used on the page", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const used = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
  for (const key of used) assert.ok(KEYS.includes(key), `${key} is on the page but not in the table`);
  for (const key of KEYS) assert.ok(used.includes(key), `${key} is in the table but not on the page`);
});

test("applying a language changes the text of an element, keeps the checkbox inside a label, and sets the page language", () => {
  const text = (value) => ({ nodeType: 3, textContent: value });
  const button = { childNodes: [text("Begin mission")], children: [], getAttribute: () => "title.begin", textContent: "Begin mission" };
  const label = {
    childNodes: [text(" Mute sound")],
    children: [{ tag: "input" }],
    getAttribute: () => "settings.mute",
  };
  const root = { querySelectorAll: () => [button, label], documentElement: {} };
  applyTranslations(root, "es");
  assert.equal(button.childNodes[0].textContent, "Comenzar misión");
  assert.equal(label.childNodes[0].textContent, " Silenciar el sonido", "the checkbox is not touched, only the words");
  assert.equal(root.documentElement.lang, "es");
});
