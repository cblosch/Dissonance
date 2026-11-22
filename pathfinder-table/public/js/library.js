// "My characters": builds saved outside any game, ready to bring into one.
import { h, clear, toast, modal, confirmDialog, actionSheet, select, field } from "./ui.js";
import { listLibrary, saveToLibrary, deleteFromLibrary, assignCharacter, myGames, downloadFile } from "./transport.js";
import { loadCore, coreData } from "./data.js";
import { computeCharacter, validateCharacter } from "./shared/rules.js";

function summary(c) {
  try {
    const comp = computeCharacter(c, coreData());
    return `Level ${c.level} ${c.ancestry || "?"} ${c.class || "?"} · HP ${comp.maxHp} · AC ${comp.ac}`;
  } catch { return `Level ${c.level || 1} ${c.ancestry || ""} ${c.class || ""}`; }
}

// Full-screen builder for a saved character. Resolves when the person saves or cancels.
export async function editSaved(app, char, { onDone } = {}) {
  await loadCore();
  const { mountBuilder, blankCharacter } = await import("./builder.js");
  clear(app);
  const wrap = h("div", { class: "main solo-builder" });
  app.append(wrap);
  window.scrollTo(0, 0);
  mountBuilder(wrap, char || blankCharacter(1), {
    title: char ? `Edit ${char.name || "character"}` : "New character",
    onSave: async (c) => {
      try { await saveToLibrary({ ...c, libId: char?.libId }); toast(`${c.name || "Character"} saved to My characters`); onDone && onDone(); }
      catch (e) { toast(e.message, "error"); }
    },
    onCancel: () => onDone && onDone(),
  });
}

// Landing-page section
export function libraryPanel(app, { refresh }) {
  const box = h("section", { class: "card library" }, h("div", { class: "row between" }, h("h2", {}, "My characters"),
    h("div", { class: "row" },
      h("button", { class: "small", onclick: () => importDialog(refresh) }, "Import"),
      h("button", { class: "small primary", onclick: () => editSaved(app, null, { onDone: refresh }) }, "+ New character"))));
  const list = h("div", { class: "lib-list" }, h("p", { class: "muted" }, "Loading…"));
  box.append(list, h("p", { class: "hint" }, "Build characters here before you have a game, then bring one when you join, or send it to a game you're already in."));
  (async () => {
    await loadCore();
    let chars = [];
    try { chars = await listLibrary(); } catch (e) { clear(list).append(h("p", { class: "error" }, e.message)); return; }
    clear(list);
    if (!chars.length) list.append(h("p", { class: "muted" }, "No saved characters yet."));
    for (const c of chars) {
      const issues = validateCharacter(c, coreData()).length;
      list.append(h("div", { class: "lib-card" },
        h("div", { class: "token-dot small", style: { background: c.color || "#3b6ea5" } }, (c.name || "?")[0]),
        h("div", { class: "lib-text" }, h("strong", {}, c.name || "Unnamed"), h("small", { class: "muted" }, summary(c)), issues ? h("small", { class: "warn" }, `${issues} choice${issues > 1 ? "s" : ""} left`) : null),
        h("button", { class: "small", onclick: () => editSaved(app, c, { onDone: refresh }) }, "Edit"),
        h("button", { class: "icon-btn", title: "More", onclick: () => actionSheet(c.name || "Character", [
          { icon: "🎲", label: "Use in one of my games", onClick: () => useInGame(c) },
          { icon: "⬆️", label: "Level up (copy at next level)", onClick: () => editSaved(app, { ...structuredClone(c), libId: undefined, level: Math.min(20, (c.level || 1) + 1) }, { onDone: refresh }) },
          { icon: "📄", label: "Duplicate", onClick: async () => { await saveToLibrary({ ...structuredClone(c), libId: undefined, name: `${c.name} (copy)` }); refresh(); } },
          { icon: "💾", label: "Export as file", onClick: () => downloadFile(`${(c.name || "character").replace(/[^\w-]+/g, "_")}.json`, JSON.stringify(c, null, 2)).catch((e) => toast(e.message, "error")) },
          { icon: "🗑", label: "Delete", onClick: async () => { if (await confirmDialog(`Delete ${c.name || "this character"} from My characters? Games it's already in keep their copy.`, { ok: "Delete", danger: true })) { await deleteFromLibrary(c.libId); refresh(); } } },
        ]) }, "⋯")));
    }
  })();
  return box;
}

async function useInGame(c) {
  const games = (await myGames()).filter((g) => g.role === "player");
  if (!games.length) return toast("Join a game first, then you can send this character to it.");
  const sel = select(games.map((g) => ({ value: g.code, label: `${g.name || "Untitled"} (${g.code})` })), games[0].code, () => {});
  const m = modal(`Use ${c.name} in a game`, h("div", { class: "dialog" },
    field("Game", sel),
    h("p", { class: "hint" }, "This replaces the character you have in that game. Your saved copy here stays as it is."),
    h("div", { class: "row end" }, h("button", { onclick: () => m.close() }, "Cancel"),
      h("button", { class: "primary", onclick: async () => {
        try { await assignCharacter(sel.value, strip(c)); toast(`${c.name} sent to the game`); m.close(); }
        catch (e) { toast(e.message, "error"); }
      } }, "Use this character"))));
}

// The copy that goes into a game (library bookkeeping removed)
export function strip(c) {
  const { libId, savedAt, ...rest } = structuredClone(c);
  return rest;
}

// Modal list to choose a saved character. Resolves the character or null.
export function pickFromLibrary(title = "Choose a character") {
  return new Promise(async (resolve) => {
    await loadCore();
    const chars = await listLibrary().catch(() => []);
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); m.close(); } };
    const body = h("div", { class: "lib-list" });
    if (!chars.length) body.append(h("p", { class: "muted" }, "You have no saved characters yet. Build one from the start screen's My characters, or build one in the game."));
    for (const c of chars) body.append(h("button", { class: "lib-card pickable", onclick: () => finish(strip(c)) },
      h("div", { class: "token-dot small", style: { background: c.color || "#3b6ea5" } }, (c.name || "?")[0]),
      h("div", { class: "lib-text" }, h("strong", {}, c.name || "Unnamed"), h("small", { class: "muted" }, summary(c)))));
    const m = modal(title, body, { onClose: () => finish(null) });
  });
}

async function importDialog(refresh) {
  const input = h("input", { type: "file", accept: "application/json,.json" });
  const m = modal("Import a character", h("div", { class: "dialog" },
    h("p", { class: "hint" }, "Choose a character file exported from Pathfinder Table."), input,
    h("div", { class: "row end" }, h("button", { onclick: () => m.close() }, "Cancel"),
      h("button", { class: "primary", onclick: async () => {
        const f = input.files?.[0];
        if (!f) return toast("Choose a file first.");
        try {
          const c = JSON.parse(await f.text());
          if (!c || typeof c !== "object" || !("class" in c || "ancestry" in c)) throw new Error("That file isn't a Pathfinder Table character.");
          await saveToLibrary({ ...c, libId: undefined });
          m.close(); refresh();
        } catch (e) { toast(e.message, "error"); }
      } }, "Import"))));
}
