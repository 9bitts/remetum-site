import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCallMessage,
  extractMentionedHandles,
  formatPushCopy,
  isPermanentMute,
  isValidHandle,
  MUTE_FOREVER_ISO,
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

test("extractMentionedHandles finds valid handles", () => {
  assert.deepEqual(extractMentionedHandles("oi @maria e @joao_ok"), [
    "maria",
    "joao_ok",
  ]);
  assert.deepEqual(extractMentionedHandles("email me@site.com @ab"), []);
});

test("formatPushCopy uses person or group, not the app name", () => {
  const dm = formatPushCopy({
    preview: "full",
    kind: "message",
    conversationType: "direct",
    conversationName: null,
    senderName: "Ana Souza",
    snippet: "Viu o laudo?",
  });
  assert.deepEqual(dm, { title: "Ana Souza", body: "Viu o laudo?" });

  const group = formatPushCopy({
    preview: "full",
    kind: "message",
    conversationType: "group",
    conversationName: "Equipe",
    senderName: "Ana Souza",
    snippet: "Viu o laudo?",
  });
  assert.deepEqual(group, { title: "Equipe", body: "Ana Souza: Viu o laudo?" });

  const hidden = formatPushCopy({
    preview: "hidden",
    kind: "mention",
    conversationType: "group",
    conversationName: "Equipe",
    senderName: "Ana Souza",
    snippet: "secreto",
  });
  assert.deepEqual(hidden, { title: "Remetum", body: "Nova notificação" });
});

test("isPermanentMute detects the forever sentinel", () => {
  assert.equal(isPermanentMute(MUTE_FOREVER_ISO), true);
  assert.equal(isPermanentMute(new Date().toISOString()), false);
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
