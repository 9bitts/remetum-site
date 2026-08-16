import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCallMessage,
  isValidHandle,
  normalizeHandle,
  parseCallMessage,
  suggestHandle,
} from "@ebano/shared";

test("normalizeHandle strips accents and symbols", () => {
  assert.equal(normalizeHandle("João Silva!"), "joao_silva");
  assert.equal(normalizeHandle("@Diego"), "diego");
});

test("suggestHandle respects reserved words", () => {
  assert.notEqual(suggestHandle("admin"), "admin");
  assert.ok(isValidHandle(suggestHandle("Maria")));
});

test("isValidHandle rejects short and reserved", () => {
  assert.equal(isValidHandle("ab"), false);
  assert.equal(isValidHandle("login"), false);
  assert.equal(isValidHandle("diego_ok"), true);
});

test("call message encode/decode", () => {
  const parsed = parseCallMessage(
    JSON.stringify({ event: "missed", video: true }),
  );
  assert.deepEqual(parsed, { event: "missed", video: true });
  assert.equal(formatCallMessage(parsed), "Chamada de vídeo perdida");
  assert.equal(
    formatCallMessage({ event: "ended", video: false }, 125000),
    "Chamada de voz · 2:05",
  );
});
