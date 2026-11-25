/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

// Scheduled AI work (study material, lesson building) must not run here.
beforeEach(() => void vi.useFakeTimers({ toFake: ["setTimeout"] }));
afterEach(() => void vi.useRealTimers());

function setup() {
  const t = convexTest(schema, modules);
  const signUp = async (email: string) => {
    const { userId, sessionId, profileId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email, approvedAt: 1 });
      const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 1e9 });
      const profileId = await ctx.db.insert("profiles", { userId, name: "French", baseLang: "es", targetLang: "fr" });
      return { userId, sessionId, profileId };
    });
    const as = t.withIdentity({ subject: `${userId}|${sessionId}` });
    const token = await as.action(api.apiTokens.create, { name: "Claude" });
    const rpc = async (method: string, params?: unknown) => {
      const res = await t.fetch("/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      return { status: res.status, body: await res.json() };
    };
    const call = async (name: string, args: unknown = {}) => {
      const { body } = await rpc("tools/call", { name, arguments: args });
      return body.result as {
        content: { text: string }[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape differs per tool
        structuredContent?: any;
        isError?: boolean;
      };
    };
    return { as, userId, profileId, token, rpc, call };
  };
  return { t, signUp };
}

const CHAT = { kind: "lemma", key: "chat", text: "le chat", gloss: "gato" };
const CHAT_CARD = { itemKeys: ["chat"], kind: "meaning", prompt: "gato", answer: "le chat", accepted: ["le chat", "chat"] };
const LESSON = { newUnitTitle: "Animales", title: "Mascotas", items: [CHAT], cards: [CHAT_CARD] };

describe("mcp", () => {
  it("speaks the protocol and describes every tool", async () => {
    const { signUp } = setup();
    const { rpc } = await signUp("a@example.com");
    const init = await rpc("initialize", { protocolVersion: "2025-06-18" });
    expect(init.body.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "tutor" } });
    const { tools } = (await rpc("tools/list")).body.result;
    expect(tools).toHaveLength(19);
    for (const tool of tools) expect(tool.inputSchema.type).toBe("object");
  });

  it("creates a lesson and edits its cards and items", async () => {
    const { signUp, t } = setup();
    const { call, as, profileId } = await signUp("a@example.com");
    const created = (await call("create_lesson", { ...LESSON, fillStudyMaterial: false })).structuredContent;
    const { lessonId, unitId } = created;
    expect((await call("get_curriculum")).structuredContent).toMatchObject({
      profile: { profileId },
      units: [{ unitId, title: "Animales", lessons: [{ lessonId, status: "ready" }] }],
    });
    const [card] = (await call("list_cards", { lessonId })).structuredContent.cards;

    // Replacing the answer drops the old one but keeps other alternatives.
    const updated = await call("update_cards", { cards: [{ cardId: card.cardId, answer: "un chat" }] });
    expect(updated.structuredContent.updated[0]).toMatchObject({ prompt: "gato", accepted: ["un chat", "chat"] });
    expect(await as.query(api.practice.allCards, { profileId, lessonId })).toMatchObject([{ answer: "un chat" }]);

    const itemId = card.itemIds[0];
    const details = { explanation: "Animal doméstico." };
    await call("update_items", { items: [{ itemId, gloss: "el gato", details }] });
    expect((await call("get_item", { itemId })).structuredContent).toMatchObject({
      gloss: "el gato",
      notes: null,
      details,
      lessons: [{ lessonId }],
    });

    const form = { itemIds: [itemId], kind: "form", prompt: "___ dort", answer: "le chat" };
    expect((await call("add_cards", { cards: [form, form] })).structuredContent).toMatchObject({
      added: [{ answer: "le chat" }],
      duplicatesSkipped: 1,
    });
    // add_to_lesson cards may use items already in the lesson.
    const added = await call("add_to_lesson", {
      lessonId,
      items: [{ kind: "lemma", key: "Chien", text: "le chien", gloss: "perro" }],
      cards: [{ itemKeys: ["chien", "chat"], kind: "form", prompt: "le chat et le ___", answer: "chien", accepted: [] }],
    });
    expect(added.structuredContent.items).toHaveLength(2);
    expect((await call("list_cards", { search: "et le" })).structuredContent.cards[0].itemIds).toHaveLength(2);

    await call("delete_cards", { cardIds: [card.cardId] });
    expect((await call("list_cards", { lessonId })).structuredContent.total).toBe(2);
    await call("remove_from_lesson", { lessonId, itemIds: [itemId] });
    expect((await call("get_lesson", { lessonId })).structuredContent.items).toMatchObject([{ key: "chien" }]);
    expect((await call("list_items")).structuredContent.total).toBe(2);

    const guide = { sections: [{ heading: "Género", body: "…" }] };
    await call("update_lesson", { lessonId, title: "Gatos", guide });
    expect((await call("get_lesson", { lessonId })).structuredContent).toMatchObject({ title: "Gatos", guide });

    // Late background writing doesn't overwrite what the agent wrote.
    await t.mutation(internal.study.saveGuide, { lessonId, guide: { sections: [] } });
    await t.mutation(internal.study.saveDetails, { entries: [{ itemId, details: { explanation: "late" } }] });
    expect((await call("get_lesson", { lessonId })).structuredContent.guide).toEqual(guide);
    expect((await call("get_item", { itemId })).structuredContent.details).toEqual(details);
  });

  it("starts the coach's background work", async () => {
    const { signUp } = setup();
    const { call } = await signUp("a@example.com");
    const { lessonId } = (await call("create_lesson", LESSON)).structuredContent;
    expect((await call("get_lesson", { lessonId })).structuredContent.guideStatus).toBe("writing");
    const unit = await call("create_unit", { title: "Café", lessons: [{ title: "Pedir", focus: "pedir un café" }] });
    const [building] = unit.structuredContent.lessonIds;
    expect((await call("get_lesson", { lessonId: building })).structuredContent.status).toBe("building");
  });

  it("explains bad input and saves nothing", async () => {
    const { signUp } = setup();
    const { call } = await signUp("a@example.com");
    const bad = async (args: object, text: RegExp) => {
      const res = await call("create_lesson", { ...LESSON, ...args });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toMatch(text);
    };
    await bad({ cards: [{ ...CHAT_CARD, kind: "form" }] }, /exactly one "___" gap/);
    await bad({ cards: [{ ...CHAT_CARD, itemKeys: ["chien"] }] }, /no item with key "chien"/);
    await bad({ newUnitTitle: undefined }, /either unitId or newUnitTitle/);
    await bad({ items: [] }, /Invalid arguments/);
    expect((await call("get_curriculum")).structuredContent.units).toEqual([]);
  });

  it("never reaches another user's data", async () => {
    const { signUp } = setup();
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const { lessonId, unitId } = (await alice.call("create_lesson", LESSON)).structuredContent;
    const [card] = (await alice.call("list_cards", { lessonId })).structuredContent.cards;
    const [itemId] = card.itemIds;
    const { cardId } = card;
    const profileId = alice.profileId;
    const attempts: [string, object][] = [
      ["get_curriculum", { profileId }],
      ["list_items", { profileId }],
      ["list_items", { lessonId }],
      ["list_cards", { profileId }],
      ["list_cards", { itemId }],
      ["list_mistakes", { profileId }],
      ["get_lesson", { lessonId }],
      ["get_item", { itemId }],
      ["create_lesson", { ...LESSON, profileId }],
      ["create_lesson", { ...LESSON, newUnitTitle: undefined, unitId }],
      ["create_unit", { profileId, title: "x" }],
      ["add_to_lesson", { lessonId, items: [CHAT] }],
      ["add_cards", { cards: [{ itemIds: [itemId], kind: "meaning", prompt: "x", answer: "y" }] }],
      ["update_cards", { cards: [{ cardId, answer: "x" }] }],
      ["delete_cards", { cardIds: [cardId] }],
      ["update_items", { items: [{ itemId, gloss: "x" }] }],
      ["update_lesson", { lessonId, title: "x" }],
      ["update_unit", { unitId, title: "x" }],
      ["remove_from_lesson", { lessonId, itemIds: [itemId] }],
      ["fill_study_material", { lessonId }],
      ["fill_study_material", { itemId }],
      ["rebuild_lesson", { lessonId }],
    ];
    for (const [name, args] of attempts) {
      const res = await bob.call(name, args);
      expect(res.isError, name).toBe(true);
      expect(res.content[0].text, name).toMatch(/not found/);
    }
    expect((await alice.call("get_lesson", { lessonId })).structuredContent.items).toHaveLength(1);
  });

  it("only accepts live tokens of users with access", async () => {
    const { signUp, t } = setup();
    const { as, rpc, token, userId } = await signUp("a@example.com");
    const ping = (path: string) =>
      t.fetch(path, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
    expect((await ping(`/mcp/t/${token}`)).status).toBe(200);
    expect((await ping(`/mcp/t/${token}x`)).status).toBe(401);
    expect((await ping("/mcp")).status).toBe(401);
    expect((await t.fetch("/mcp", { method: "GET" })).status).toBe(405);

    const setApproved = (approvedAt?: number) => t.run((ctx) => ctx.db.patch("users", userId, { approvedAt }));
    await setApproved(undefined);
    expect((await rpc("ping")).status).toBe(401);
    await expect(as.action(api.apiTokens.create, { name: "x" })).rejects.toThrow(/wishlist/);
    await setApproved(1);
    expect((await rpc("ping")).status).toBe(200);

    const [listed] = await as.query(api.apiTokens.list, {});
    await as.mutation(api.apiTokens.revoke, { tokenId: listed._id });
    expect((await rpc("ping")).status).toBe(401);
  });
});
