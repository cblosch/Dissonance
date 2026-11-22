import { h, clear, toast, select, signed, confirmDialog, promptDialog } from "./ui.js";
import { act } from "./transport.js";
import { coreData } from "./data.js";
import { computeCharacter } from "./shared/rules.js";

// ------------------------------------------------------------
// Chat, dice and log
// ------------------------------------------------------------
export function createLogPanel({ isDM }) {
  const box = h("div", { class: "log" });
  const input = h("input", { placeholder: "Chat, or /r 1d20+5 to roll", enterkeyhint: "send" });
  const dc = h("input", { placeholder: "DC", type: "number", inputmode: "numeric", class: "dc-input", title: "Optional DC: shows degree of success" });
  const asSel = isDM ? h("input", { placeholder: "speak as…", class: "as-input" }) : null;
  const secret = h("input", { type: "checkbox", title: isDM ? "Secret roll (only the GM sees it)" : "Roll privately to the GM" });
  const send = async () => {
    const v = input.value.trim();
    if (!v) return;
    try {
      const m = v.match(/^\/(?:r|roll)\s+(.+)$/i);
      if (m) await act("roll", { formula: m[1], label: m[1], dc: dc.value || null, private: secret.checked, as: asSel?.value || undefined });
      else await act("chat", { text: v, as: asSel?.value || undefined });
      input.value = "";
    } catch (e) { toast(e.message, "error"); }
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && send());
  const quick = h("div", { class: "dice-row" }, ["d4", "d6", "d8", "d10", "d12", "d20", "d100"].map((d) =>
    h("button", { class: "small die", onclick: () => act("roll", { formula: `1${d}`, label: d, private: secret.checked, dc: dc.value || null }).catch((e) => toast(e.message, "error")) }, d)),
    h("label", { class: "check small" }, secret, isDM ? " secret" : " private"), dc);
  const el = h("div", { class: "log-panel" }, box, h("div", { class: "log-controls" }, quick, h("div", { class: "row chat-row" }, asSel, input, h("button", { class: "primary", onclick: send }, "Send"))));
  let lastId = null;
  function update(state) {
    const newest = state.log.at(-1)?.id;
    if (newest === lastId) return;
    lastId = newest;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    clear(box);
    for (const l of state.log.slice(-150)) box.append(logEntry(l, isDM));
    if (nearBottom || !box.dataset.scrolled) { box.scrollTop = box.scrollHeight; box.dataset.scrolled = "1"; }
  }
  // re-pin to bottom when the panel is shown again (e.g. switching to the chat tab on a phone)
  const scrollDown = () => requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
  return { el, update, scrollDown };
}

function logEntry(l, isDM) {
  const time = new Date(l.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (l.type === "roll") {
    return h("div", { class: `log-roll ${l.private ? "private" : ""} ${l.roll.natural === 20 ? "nat20" : l.roll.natural === 1 ? "nat1" : ""}` },
      h("div", { class: "row between" }, h("strong", {}, l.who), h("small", { class: "muted" }, time)),
      h("div", {}, l.label || l.roll.expr, l.private ? h("span", { class: "tag" }, isDM ? "secret" : "to GM") : null),
      h("div", { class: "roll-total" }, h("span", { class: "total" }, l.roll.total), h("small", { class: "muted" }, ` ${l.roll.detail}`)),
      l.outcome ? h("div", { class: `outcome o${["Critical Failure", "Failure", "Success", "Critical Success"].indexOf(l.outcome)}` }, `${l.outcome} vs DC ${l.dc}`) : null);
  }
  if (l.type === "chat") return h("div", { class: "log-chat" }, h("strong", {}, l.who, ": "), l.text, h("small", { class: "muted" }, ` ${time}`));
  return h("div", { class: "log-system" }, l.text);
}

// Persistent initiative panel: the list re-renders, the GM's "add" inputs keep what's typed.
export function createInitiativePanel(opts) {
  const inner = h("div", {});
  let state = null;
  const addRow = opts.isDM ? initiativeAddRow(() => state) : null;
  const el = h("div", { class: "initiative" }, inner, addRow);
  return { el, update(s) { state = s; clear(inner).append(initiativePanel(s, opts)); } };
}

function initiativeAddRow(getState) {
  const name = h("input", { placeholder: "Name", class: "grow-input" });
  const init = h("input", { type: "number", inputmode: "numeric", placeholder: "Init", class: "num-input" });
  const hp = h("input", { type: "number", inputmode: "numeric", placeholder: "HP", class: "num-input" });
  return h("details", { class: "ini-add" }, h("summary", {}, "Add combatant"),
    h("div", { class: "row" }, name, init, hp,
      h("button", { class: "small", onclick: () => { if (!name.value) return; act("initiative", { op: "add", name: name.value, init: +init.value || 0, hp: hp.value ? +hp.value : null, kind: "enemy" }); name.value = ""; init.value = ""; hp.value = ""; } }, "Add")),
    h("button", { class: "small", onclick: () => addCompanionsToInitiative(getState()) }, "Roll for AI companions"));
}

// ------------------------------------------------------------
// Initiative tracker
// ------------------------------------------------------------
export function initiativePanel(state, { isDM, onCompanionTurn, onShowCreature }) {
  const ini = state.initiative;
  const data = coreData();
  const box = h("div", {});
  const head = h("div", { class: "row between" }, h("h3", {}, ini.active ? `Round ${ini.round}` : "Initiative"));
  box.append(head);
  if (isDM) {
    head.append(h("div", { class: "row" },
      !ini.active ? h("button", { class: "small primary", onclick: () => act("initiative", { op: "start" }) }, "Start") : null,
      ini.active ? h("button", { class: "small", onclick: () => act("initiative", { op: "prev" }) }, "◀") : null,
      ini.active ? h("button", { class: "small primary", onclick: () => act("initiative", { op: "next" }) }, "Next ▶") : null,
      ini.entries.length ? h("button", { class: "small", onclick: async () => (await confirmDialog("End the encounter and clear initiative?", { ok: "End encounter" })) && act("initiative", { op: "end" }) }, "End") : null));
  }
  // player: roll my initiative
  if (!isDM) {
    const slot = state.slots[state.me.slot];
    const ch = slot?.characterId ? state.characters[slot.characterId] : null;
    if (ch) {
      const comp = computeCharacter(ch, data);
      const skillSel = select([{ value: "perception", label: `Perception ${signed(comp.perception)}` }, ...Object.entries(comp.skills).filter(([s]) => ["stealth", "deception", "diplomacy", "intimidation", "performance", "athletics"].includes(s)).map(([s, v]) => ({ value: s, label: `${s[0].toUpperCase() + s.slice(1)} ${signed(v)}` }))], "perception", () => {});
      box.append(h("div", { class: "row" }, skillSel, h("button", { class: "small primary", onclick: () => {
        const sk = skillSel.value;
        const mod = sk === "perception" ? comp.perception : comp.skills[sk];
        act("initiative", { op: "rollMe", mod, skill: sk }).catch((e) => toast(e.message, "error"));
      } }, "Roll initiative")));
    }
  }
  const list = h("ol", { class: "ini-list" });
  ini.entries.forEach((e, i) => {
    const current = ini.active && i === ini.turn;
    const pc = e.charId ? state.characters[e.charId] : null;
    let hpText = "";
    if (pc) { const comp = computeCharacter(pc, data); hpText = `${pc.live?.hp ?? comp.maxHp}/${comp.maxHp} HP`; }
    else if (isDM && e.maxHp) hpText = `${e.hp}/${e.maxHp} HP · AC ${e.ac}`;
    else if (e.hpState) hpText = e.hpState;
    const isCompanion = pc?.companion;
    list.append(h("li", { class: `${current ? "current" : ""} ${e.kind} ${e.hidden ? "hidden-entry" : ""}` },
      h("span", { class: "init" }, e.init),
      h("span", { class: "name" }, isDM && e.creature ? h("button", { class: "link", onclick: () => onShowCreature && onShowCreature(e.creature) }, e.name) : e.name, e.hidden ? h("small", { class: "muted" }, " (hidden)") : null),
      h("small", { class: "muted" }, hpText),
      (e.conditions || []).length ? h("small", { class: "conds" }, e.conditions.join(", ")) : null,
      isDM ? h("span", { class: "ini-ctl" },
        e.maxHp ? h("input", { type: "number", placeholder: "dmg", title: "Damage (positive) or healing (negative)", class: "num-input", onchange: (ev) => { act("initiative", { op: "update", id: e.id, patch: { hp: Math.max(0, Math.min(e.maxHp, e.hp - +ev.target.value)) } }); } }) : null,
        h("input", { type: "number", inputmode: "numeric", value: e.init, title: "Initiative", class: "num-input", onchange: (ev) => act("initiative", { op: "update", id: e.id, patch: { init: +ev.target.value } }) }),
        h("button", { class: "icon", title: "Conditions", onclick: async () => { const c = await promptDialog(`Conditions on ${e.name}`, (e.conditions || []).join(", "), "Conditions (comma separated, e.g. frightened 1, off-guard)"); if (c !== null) act("initiative", { op: "update", id: e.id, patch: { conditions: c.split(",").map((x) => x.trim()).filter(Boolean) } }); } }, "⚑"),
        e.hidden ? h("button", { class: "icon", title: "Reveal", onclick: () => act("initiative", { op: "update", id: e.id, patch: { hidden: false } }) }, "👁") : null,
        isCompanion && onCompanionTurn ? h("button", { class: "icon", title: "Suggest companion turn", onclick: () => onCompanionTurn(pc) }, "🤖") : null,
        h("button", { class: "icon", title: "Remove", onclick: () => act("initiative", { op: "remove", id: e.id }) }, "✕")) : null));
  });
  box.append(list);
  return box;
}

async function addCompanionsToInitiative(state) {
  const data = coreData();
  for (const s of state.slots.filter((x) => x.type === "companion")) {
    const c = state.characters[s.characterId];
    if (!c || state.initiative.entries.some((e) => e.charId === c.id)) continue;
    const comp = computeCharacter(c, data);
    const res = await act("roll", { formula: `1d20${signed(comp.perception)}`, label: "Initiative (Perception)", as: c.name });
    await act("initiative", { op: "add", name: c.name, init: res.result.total, kind: "ally", charId: c.id });
  }
}
