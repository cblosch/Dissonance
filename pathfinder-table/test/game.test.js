import test from "node:test";
import assert from "node:assert/strict";
import { createGame, joinGame, authFor, viewFor, applyAction } from "../server/game.js";

function setup() {
  const g = createGame("ABCDEF", "Test");
  const dm = authFor(g, { key: g.dmKey });
  const p1 = joinGame(g, { name: "Ann" });
  const p2 = joinGame(g, { name: "Bo" });
  return { g, dm, a1: authFor(g, { token: p1.token }), a2: authFor(g, { token: p2.token }) };
}

test("roles and seats", () => {
  const { g, dm, a1, a2 } = setup();
  assert.equal(dm.role, "dm");
  assert.equal(a1.slot, 0);
  assert.equal(a2.slot, 1);
  assert.equal(authFor(g, { key: "wrong" }), null);
  for (let i = 0; i < 4; i++) joinGame(g, { name: "x" + i });
  assert.throws(() => joinGame(g, { name: "seventh" }), /six seats/);
});

test("player view hides GM-only data", () => {
  const { g, dm, a1 } = setup();
  applyAction(g, dm, "setPlot", { plot: { synopsis: "The butler did it", npcs: [{ name: "Butler", secret: "guilty" }] } });
  applyAction(g, dm, "addNote", { text: "private note" });
  applyAction(g, dm, "addNote", { text: "public note", public: true });
  const v = viewFor(g, a1);
  assert.equal(v.dmKey, undefined);
  assert.equal(v.plot.synopsis, undefined);
  assert.equal(v.plot.npcs, undefined);
  assert.deepEqual(v.notes.map((n) => n.text), ["public note"]);
  assert.ok(v.slots.every((s) => s.token === undefined), "tokens are never sent");
  assert.equal(viewFor(g, dm).dmKey, undefined);
});

test("fog of war: players only receive revealed squares and tokens", () => {
  const { g, dm, a1 } = setup();
  const w = 4, h = 3;
  const id = applyAction(g, dm, "saveMap", { map: { name: "m", w, h, cells: "####.S.##..#".slice(0, 12), tokens: [] }, activate: true });
  applyAction(g, dm, "token", { op: "add", x: 1, y: 1, label: "G", kind: "enemy" });
  let v = viewFor(g, a1);
  assert.ok(/^\?+$/.test(v.map.cells), "nothing revealed yet");
  assert.equal(v.map.tokens.length, 0);
  applyAction(g, dm, "fog", { mapId: id, cells: [5], reveal: true });
  v = viewFor(g, a1);
  assert.equal(v.map.cells[5], "S");
  assert.equal(v.map.cells[4], "?");
  assert.equal(v.map.tokens.length, 1);
  applyAction(g, dm, "token", { op: "toggleHidden", id: g.maps[0].tokens[0].id });
  assert.equal(viewFor(g, a1).map.tokens.length, 0);
});

test("players can only move their own token onto revealed, open squares", () => {
  const { g, dm, a1 } = setup();
  const id = applyAction(g, dm, "saveMap", { map: { name: "m", w: 3, h: 1, cells: "..#", tokens: [] }, activate: true });
  applyAction(g, dm, "token", { op: "add", x: 0, y: 0, label: "A", kind: "pc", slot: 0 });
  applyAction(g, dm, "token", { op: "add", x: 0, y: 0, label: "B", kind: "pc", slot: 1 });
  const [mine, theirs] = g.maps[0].tokens;
  assert.throws(() => applyAction(g, a1, "token", { op: "move", id: mine.id, x: 1, y: 0 }), /can't move/);
  applyAction(g, dm, "fog", { mapId: id, all: true });
  applyAction(g, a1, "token", { op: "move", id: mine.id, x: 1, y: 0 });
  assert.equal(mine.x, 1);
  assert.throws(() => applyAction(g, a1, "token", { op: "move", id: theirs.id, x: 1, y: 0 }), /own token/);
  assert.throws(() => applyAction(g, a1, "token", { op: "move", id: mine.id, x: 2, y: 0 }), /can't move/);
});

test("handouts reach only their recipients; secret rolls stay secret", () => {
  const { g, dm, a1, a2 } = setup();
  applyAction(g, dm, "handout", { title: "For Ann", kind: "letter", body: "hi", to: [0] });
  applyAction(g, dm, "handout", { title: "Everyone", kind: "notice", body: "hi", to: "all" });
  assert.deepEqual(viewFor(g, a1).handouts.map((x) => x.title), ["For Ann", "Everyone"]);
  assert.deepEqual(viewFor(g, a2).handouts.map((x) => x.title), ["Everyone"]);
  applyAction(g, dm, "roll", { formula: "1d20", label: "secret", private: true });
  applyAction(g, a1, "roll", { formula: "1d20", label: "ann private", private: true });
  assert.ok(!viewFor(g, a2).log.some((l) => l.label === "secret" || l.label === "ann private"));
  assert.ok(viewFor(g, a1).log.some((l) => l.label === "ann private"));
  assert.ok(viewFor(g, dm).log.some((l) => l.label === "ann private"));
});

test("players can't use GM actions or edit other characters", () => {
  const { g, dm, a1, a2 } = setup();
  assert.throws(() => applyAction(g, a1, "setPlot", { plot: {} }), /GM/);
  assert.throws(() => applyAction(g, a1, "kick", { slot: 1 }), /GM/);
  applyAction(g, a2, "saveCharacter", { character: { name: "Bo's hero", level: 1 } });
  const cid = g.slots[1].characterId;
  assert.throws(() => applyAction(g, a1, "updateCharacterState", { characterId: cid, live: { hp: 0 } }), /isn't your/);
  applyAction(g, dm, "updateCharacterState", { characterId: cid, live: { hp: 3 } });
  assert.equal(g.characters[cid].live.hp, 3);
});

test("AI companions fill open seats and enemy HP is hidden from players", () => {
  const { g, dm, a1 } = setup();
  applyAction(g, dm, "fillCompanion", { slot: 2, character: { name: "Kyra", level: 1, class: "Cleric" } });
  assert.equal(g.slots[2].type, "companion");
  applyAction(g, dm, "initiative", { op: "add", name: "Goblin", init: 12, hp: 6, ac: 16, kind: "enemy" });
  const e = viewFor(g, a1).initiative.entries[0];
  assert.equal(e.hp, undefined);
  assert.equal(e.ac, undefined);
  assert.equal(e.hpState, "unhurt");
});
