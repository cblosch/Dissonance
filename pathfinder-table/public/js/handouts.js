import { h, clear, cap, field, select, modal, richText, toast } from "./ui.js";
import { load } from "./data.js";
import { dcForLevel, RARITY_ADJUST, AON } from "./shared/rules.js";

export const HANDOUT_KINDS = {
  letter: "Letter", notice: "Notice / wanted poster", journal: "Journal page", prophecy: "Scroll / prophecy",
  clue: "Clue note", item: "Item card", creature: "Creature lore card", npc: "NPC card", mapfrag: "Map fragment", custom: "Plain text",
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ------------------------------------------------------------
// Rendering
// ------------------------------------------------------------
export function renderHandout(ho) {
  const m = ho.meta || {};
  const text = (s) => String(s || "").split(/\n{2,}/).map((p) => h("p", {}, ...p.split("\n").flatMap((line, i) => (i ? [h("br"), line] : [line]))));
  const card = h("article", { class: `handout ho-${ho.kind}` });
  switch (ho.kind) {
    case "letter":
      card.append(m.to ? h("p", { class: "salute" }, m.to) : null, ...text(ho.body), m.from ? h("p", { class: "sign" }, m.from) : null, m.seal ? h("div", { class: "seal" }, m.seal) : null);
      break;
    case "notice":
      card.append(h("h2", {}, m.heading || ho.title), m.subject ? h("h3", {}, m.subject) : null, ...text(ho.body), m.reward ? h("p", { class: "reward" }, m.reward) : null);
      break;
    case "item":
      card.append(h("div", { class: "row between" }, h("h3", {}, ho.title), m.level !== undefined ? h("span", {}, `Item ${m.level}`) : null),
        m.traits?.length ? h("div", { class: "traits" }, m.traits.map((t) => h("span", {}, t))) : null,
        m.price !== undefined ? h("p", { class: "muted" }, `Price ${m.price} gp · Bulk ${m.bulk ?? "—"}`) : null,
        m.html ? richText(m.html) : null, ...text(ho.body));
      break;
    case "creature":
    case "npc":
      card.append(h("h3", {}, ho.title), m.traits?.length ? h("div", { class: "traits" }, m.traits.map((t) => h("span", {}, t))) : null, ...text(ho.body));
      break;
    case "mapfrag":
      card.append(h("h3", {}, ho.title), m.image ? h("img", { src: m.image, alt: ho.title }) : null, ...text(ho.body));
      break;
    default:
      card.append(ho.kind !== "clue" ? h("h3", {}, ho.title) : null, ...text(ho.body));
  }
  return card;
}

export function printHandout(ho) {
  const w = window.open("", "_blank");
  if (!w) return toast("Allow pop-ups to print handouts.", "error");
  w.document.write(`<!doctype html><title>${ho.title.replace(/</g, "")}</title><link rel="stylesheet" href="${location.origin}/css/style.css"><body class="print-handout"></body>`);
  w.document.close();
  w.addEventListener("load", () => { w.document.body.append(renderHandout(ho)); setTimeout(() => w.print(), 200); });
}

// ------------------------------------------------------------
// Template generators (work offline, grounded in the plot)
// ------------------------------------------------------------
const npcByRole = (plot, re) => (plot.npcs || []).filter((n) => re.test(`${n.role} ${n.description}`));

export function suggestHandouts(state) {
  const plot = state.plot;
  const level = +plot.partyLevel || 1;
  const out = [];
  const villains = npcByRole(plot, /villain|antagonist|boss|enemy|cult|bandit|leader|wanted/i);
  const allies = (plot.npcs || []).filter((n) => !villains.includes(n));
  const loc = (plot.locations || [])[0];
  const loc2 = (plot.locations || [])[1] || loc;
  const reward = Math.round([0, 20, 35, 60, 100, 160, 240, 360, 500, 700, 1000][Math.min(10, level)] || level * 100);
  for (const v of villains.slice(0, 2)) {
    out.push({ kind: "notice", title: `Wanted: ${v.name}`, meta: { heading: "WANTED", subject: v.name, reward: `Reward: ${reward} gold pieces, paid on proof` },
      body: `For crimes against the people${plot.setting ? " of " + plot.setting.split(/[.,]/)[0] : ""}.\n\n${v.description ? "Description: " + v.description.split(".")[0] + "." : ""}\n\nLast seen near ${loc ? loc.name : "the old road"}. Bring information to the magistrate. Do not approach alone.` });
  }
  for (const a of allies.slice(0, 2)) {
    out.push({ kind: "letter", title: `Letter from ${a.name}`, meta: { to: "To whoever finds this,", from: `— ${a.name}`, seal: a.name[0] },
      body: `I don't have long to write. ${plot.hooks ? plot.hooks.split(".")[0] + "." : "Something is very wrong here."}\n\nIf you mean to help, start at ${loc ? loc.name : "the place we spoke of"}${loc2 && loc2 !== loc ? `, and then go on to ${loc2.name}` : ""}. Trust no one who asks after me by name.\n\nBurn this once you've read it.` });
  }
  for (const s of (plot.secrets || []).filter((x) => !x.revealed).slice(0, 4)) {
    out.push({ kind: "clue", title: "Clue", body: clueFrom(s.text), meta: { secretId: s.id } });
  }
  if (loc) {
    out.push({ kind: "notice", title: `Notice: ${loc.name}`, meta: { heading: "NOTICE", subject: loc.name },
      body: `By order of the council, travel to ${loc.name} is forbidden until further notice. ${loc.description ? "Reports speak of " + loc.description.split(".")[0].toLowerCase() + "." : "Strange lights have been seen there at night."}\n\nAnyone with knowledge of the matter should come forward.` });
  }
  if (plot.synopsis) {
    out.push({ kind: "journal", title: "Torn journal page", body: `…the third night now. ${plot.synopsis.split(".").slice(0, 1).join(".")}. I keep telling myself it's nothing.\n\nThe sounds come from ${loc2 ? loc2.name : "below"}. I've marked the way on the back of this page, though my hand shook while I drew it.` });
  }
  return out;
}

function clueFrom(text) {
  const forms = [
    (t) => `A scrap of paper, hastily written: “${t}”`,
    (t) => `Scratched into the wood, barely legible: ${t}`,
    (t) => `A note in a careful hand: “${t} — tell no one.”`,
  ];
  return pick(forms)(String(text).replace(/\.$/, ""));
}

// Creature lore card: the information a successful Recall Knowledge would give.
export function creatureLoreHandout(cr) {
  const facts = [];
  if (cr.weaknesses?.length) facts.push(`Weak to ${cr.weaknesses.join(", ")}.`);
  if (cr.resistances?.length) facts.push(`Resists ${cr.resistances.join(", ")}.`);
  if (cr.immunities?.length) facts.push(`Immune to ${cr.immunities.join(", ")}.`);
  const lowSave = [["Fortitude", cr.fort], ["Reflex", cr.ref], ["Will", cr.will]].sort((a, b) => a[1] - b[1])[0];
  facts.push(`Its weakest defense is its ${lowSave[0]}.`);
  for (const a of (cr.abilities || []).slice(0, 2)) facts.push(`It is known for ${a.name.toLowerCase()}.`);
  const blurb = (cr.blurb || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().split(". ").slice(0, 2).join(". ");
  return {
    kind: "creature", title: cr.name,
    meta: { traits: cr.traits, recallDC: dcForLevel(cr.level) + (RARITY_ADJUST[cr.rarity] || 0) },
    body: `${blurb ? blurb + (blurb.endsWith(".") ? "" : ".") + "\n\n" : ""}${facts.join("\n")}`,
  };
}

export function itemHandout(it) {
  return { kind: "item", title: it.name, body: "", meta: { level: it.level, traits: it.traits, price: it.price, bulk: it.bulk, html: it.desc } };
}

// ------------------------------------------------------------
// Editor (GM)
// ------------------------------------------------------------
export function editHandout(initial, state, { onSend, askAI } = {}) {
  const ho = structuredClone(initial || { kind: "letter", title: "", body: "", meta: {}, to: "all" });
  ho.meta ||= {};
  if (ho.to === undefined) ho.to = "all";
  const preview = h("div", { class: "handout-preview" });
  const metaBox = h("div", {});
  const redraw = () => { clear(preview); preview.append(renderHandout(ho)); };
  const metaFields = () => {
    clear(metaBox);
    const mf = (key, label) => field(label, h("input", { value: ho.meta[key] || "", oninput: (e) => { ho.meta[key] = e.target.value; redraw(); } }));
    if (ho.kind === "letter") metaBox.append(h("div", { class: "grid3" }, mf("to", "Salutation"), mf("from", "Signature"), mf("seal", "Seal letter")));
    if (ho.kind === "notice") metaBox.append(h("div", { class: "grid3" }, mf("heading", "Heading"), mf("subject", "Subject"), mf("reward", "Reward line")));
    if (ho.kind === "creature" && ho.meta.recallDC) metaBox.append(h("p", { class: "hint" }, `Recall Knowledge DC ${ho.meta.recallDC} (GM Core: DC by level + rarity). Only send what the players earned.`));
  };
  const body = h("textarea", { rows: 10, value: ho.body, oninput: (e) => { ho.body = e.target.value; redraw(); } });
  const title = h("input", { value: ho.title, oninput: (e) => { ho.title = e.target.value; redraw(); } });
  const seats = state.slots.filter((s) => s.type !== "open");
  const toBox = h("div", { class: "chips" },
    h("label", { class: "chip" }, h("input", { type: "checkbox", checked: ho.to === "all", onchange: (e) => { ho.to = e.target.checked ? "all" : []; } }), " Everyone"),
    seats.map((s) => h("label", { class: "chip" }, h("input", { type: "checkbox", checked: Array.isArray(ho.to) && ho.to.includes(s.index), onchange: (e) => {
      if (ho.to === "all") ho.to = [];
      ho.to = e.target.checked ? [...ho.to, s.index] : ho.to.filter((x) => x !== s.index);
    } }), ` ${state.characters[s.characterId]?.name || s.playerName}`)));
  const aiBtn = askAI ? h("button", { onclick: async (e) => {
    e.target.disabled = true; e.target.textContent = "Writing…";
    try {
      const r = await askAI("handout", `Kind: ${HANDOUT_KINDS[ho.kind]}. Title: ${ho.title}. Notes for what it should say: ${ho.body || "(use the plot)"}`);
      ho.body = r.text; body.value = r.text; redraw();
    } catch (err) { toast(err.message, "error"); }
    e.target.disabled = false; e.target.textContent = "✨ Write with AI";
  } }, "✨ Write with AI") : null;
  const m = modal(initial?.id ? "Edit handout" : "New handout", h("div", { class: "handout-editor" },
    h("div", {},
      h("div", { class: "grid2" },
        field("Kind", select(Object.entries(HANDOUT_KINDS).map(([value, label]) => ({ value, label })), ho.kind, (v) => { ho.kind = v; metaFields(); redraw(); })),
        field("Title", title)),
      metaBox,
      field("Text (what the players read)", body),
      h("h4", {}, "Give to"), toBox,
      h("div", { class: "row" }, aiBtn,
        h("button", { onclick: () => { onSend({ ...ho, to: [] }); m.close(); } }, "Save as draft"),
        h("button", { class: "primary", onclick: () => { onSend(ho); m.close(); } }, "Save & give"))),
    preview), { wide: true });
  metaFields(); redraw();
  return m;
}

export { AON, cap, load };
