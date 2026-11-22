import { h, clear, field, select, modal, toast, debounce, confirmDialog } from "./ui.js";
import { act } from "./transport.js";
import { MAP_TYPES } from "./map.js";

const uid = () => Math.random().toString(36).slice(2, 9);

export const SAMPLE_PLOT = {
  title: "The Lanterns of Hollowmere",
  setting: "Hollowmere, a fishing village on a fog-bound lake at the edge of the Gloomwood.",
  partyLevel: 1,
  tone: "Spooky mystery with a hopeful ending. Light on gore.",
  synopsis: "Every night for a week a villager has walked into the lake following a green lantern light. The lights come from a drowned chapel where a desperate apothecary, Mirela Vosk, is using a stolen relic to raise her drowned son. The relic is waking something older beneath the chapel.",
  hooks: "The village elder offers 20 gp each to find out who is luring people into the lake. One of the missing is a PC's cousin.",
  acts: [
    { id: uid(), title: "Fog on the water", summary: "Arrive in Hollowmere, question villagers at the Gutted Pike tavern, witness a sleepwalker at night." },
    { id: uid(), title: "The trail to the chapel", summary: "Follow lantern lights through the Gloomwood shore; fight drowned things; find Mirela's workshop." },
    { id: uid(), title: "The drowned chapel", summary: "Descend into the flooded chapel crypt, confront Mirela, and stop what the relic is waking." },
  ],
  npcs: [
    { id: uid(), name: "Elder Bram Kettlewick", role: "village elder", ancestry: "Human", description: "Tired, decent, hiding that he sold the chapel's relic years ago.", secret: "Sold the relic to a peddler; it found its way to Mirela.", location: "The Gutted Pike" },
    { id: uid(), name: "Tansy Reedwhistle", role: "tavern keeper", ancestry: "Halfling", description: "Knows every rumor; her brother is one of the missing.", secret: "", location: "The Gutted Pike" },
    { id: uid(), name: "Mirela Vosk", role: "antagonist, apothecary", ancestry: "Human", description: "Grieving mother using necromancy to bring back her drowned son.", secret: "Doesn't realize the 'son' answering her is something else wearing his voice.", location: "Drowned Chapel" },
  ],
  locations: [
    { id: uid(), name: "The Gutted Pike", type: "tavern", description: "Smoky lakeside tavern, nets on the walls, fishermen who stop talking when strangers enter." },
    { id: uid(), name: "Gloomwood Shore", type: "wilderness", description: "Mossy pines and reeds along the lake; lantern lights bob between the trees at night." },
    { id: uid(), name: "Mirela's Workshop", type: "cave", description: "A sea cave under the cliffs, full of drying herbs, jars, and a half-finished ritual circle." },
    { id: uid(), name: "Drowned Chapel", type: "dungeon", description: "A chapel to Pharasma that sank into the lake decades ago; its crypts are half flooded." },
  ],
  factions: "The Lakewardens (fisher-folk militia), the Pharasmin church in the nearby town.",
  secrets: [
    { id: uid(), text: "The sleepwalkers all bought sleeping draughts from Mirela's stall.", revealed: false, location: "The Gutted Pike" },
    { id: uid(), text: "The relic is the Lantern of Saint Ilsa, sold by Elder Bram for 300 gp.", revealed: false, location: "" },
    { id: uid(), text: "The thing under the chapel fears true daylight and Pharasma's symbol.", revealed: false, location: "Drowned Chapel" },
  ],
  rewards: "20 gp each from the elder; the Lantern of Saint Ilsa if returned to the church earns a favor.",
};

// Parse a plain-text plot: lines like "NPC: Name (role) - description", "Location: Name [dungeon] - text",
// "Act: Title - summary", "Clue: text", "Title:", "Setting:", "Level:", "Synopsis:", "Hook:".
export function parsePlotText(text) {
  const plot = { acts: [], npcs: [], locations: [], secrets: [] };
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    const m = line.match(/^(title|setting|level|party level|tone|synopsis|summary|hooks?|act|npc|location|place|clue|secret|faction|factions|rewards?)\s*[:\-]\s*(.*)$/i);
    if (!m) { if (line && plot.synopsis !== undefined && !/^#/.test(line)) plot.synopsis += " " + line; continue; }
    const key = m[1].toLowerCase(), val = m[2].trim();
    const [head, ...rest] = val.split(/\s[-–—]\s|:\s/);
    const desc = rest.join(" - ").trim();
    if (key === "title") plot.title = val;
    else if (key === "setting") plot.setting = val;
    else if (key.includes("level")) plot.partyLevel = Math.max(1, Math.min(20, parseInt(val, 10) || 1));
    else if (key === "tone") plot.tone = val;
    else if (key === "synopsis" || key === "summary") plot.synopsis = val;
    else if (key.startsWith("hook")) plot.hooks = (plot.hooks ? plot.hooks + " " : "") + val;
    else if (key === "act") plot.acts.push({ id: uid(), title: head.trim(), summary: desc });
    else if (key === "npc") {
      const rm = head.match(/^(.*?)\s*\((.*?)\)\s*$/);
      plot.npcs.push({ id: uid(), name: (rm ? rm[1] : head).trim(), role: rm ? rm[2] : "", ancestry: "", description: desc, secret: "" });
    } else if (key === "location" || key === "place") {
      const tm = head.match(/^(.*?)\s*\[(\w+)\]\s*$/);
      let type = tm ? tm[2].toLowerCase() : "";
      const nm = (tm ? tm[1] : head).trim();
      if (!MAP_TYPES[type]) type = /cave|grotto|mine|tunnel/i.test(val) ? "cave" : /forest|wood|road|river|swamp|hill|camp/i.test(val) ? "wilderness" : /town|village|city|market/i.test(val) ? "town" : /tavern|inn|house|manor|shop|hall/i.test(val) ? "tavern" : "dungeon";
      plot.locations.push({ id: uid(), name: nm, type, description: desc });
    } else if (key === "clue" || key === "secret") plot.secrets.push({ id: uid(), text: val, revealed: false, location: "" });
    else if (key.startsWith("faction")) plot.factions = (plot.factions ? plot.factions + "; " : "") + val;
    else if (key.startsWith("reward")) plot.rewards = val;
  }
  return plot;
}

export function plotEditor(state, { onSceneBrief, onMapFor, onReload }) {
  const plot = structuredClone(state.plot);
  plot.acts ||= []; plot.npcs ||= []; plot.locations ||= []; plot.secrets ||= [];
  let name = state.name;
  const saveNow = () => act("setPlot", { plot, name }).then(() => saved.textContent = "Saved ✓").catch((e) => toast(e.message, "error"));
  const save = debounce(() => { saved.textContent = "Saving…"; saveNow(); }, 700);
  const saved = h("span", { class: "muted" }, "");
  const root = h("div", { class: "plot-editor" });

  const text = (obj, key, label, rows = 0, hint) => field(label, rows
    ? h("textarea", { rows, value: obj[key] || "", oninput: (e) => { obj[key] = e.target.value; save(); } })
    : h("input", { value: obj[key] ?? "", oninput: (e) => { obj[key] = e.target.value; save(); } }), hint);

  const listSection = (title, arr, make, renderItem, addLabel) => {
    const box = h("div", { class: "plot-list" });
    const draw = () => {
      clear(box);
      arr.forEach((item, i) => box.append(h("div", { class: "plot-item" }, renderItem(item, i),
        h("div", { class: "row end" },
          i > 0 ? h("button", { class: "icon", title: "Move up", onclick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; draw(); save(); } }, "↑") : null,
          h("button", { class: "icon", title: "Delete", onclick: async () => { if (await confirmDialog("Delete this entry?", { ok: "Delete", danger: true })) { arr.splice(i, 1); draw(); save(); } } }, "🗑")))));
      box.append(h("button", { onclick: () => { arr.push(make()); draw(); save(); } }, addLabel));
    };
    draw();
    return h("section", { class: "bsec" }, h("h3", {}, title), box);
  };

  root.append(
    h("div", { class: "row between" }, h("h2", {}, "Plot & world"), h("div", { class: "row" }, saved,
      h("button", { onclick: () => importDialog() }, "Import from text"),
      !plot.title && !plot.npcs.length ? h("button", { onclick: async () => { Object.assign(plot, structuredClone(SAMPLE_PLOT)); await saveNow(); toast("Sample adventure loaded"); onReload && onReload(); } }, "Load sample adventure") : null)),
    h("p", { class: "hint" }, "Everything here powers the GM tools: scene briefs, suggested handouts, map generation, encounter themes and (if enabled) the AI assistant. Players never see this page."),
    h("section", { class: "bsec" },
      h("div", { class: "grid2" },
        field("Campaign name", h("input", { value: name, oninput: (e) => { name = e.target.value; save(); } })),
        text(plot, "title", "Adventure title"),
        field("Party level", h("input", { type: "number", min: 1, max: 20, value: plot.partyLevel || 1, oninput: (e) => { plot.partyLevel = +e.target.value; save(); } }), "Used for DCs, encounter budgets, loot and AI companions."),
        text(plot, "tone", "Tone & content notes")),
      text(plot, "setting", "Setting", 2),
      text(plot, "synopsis", "Synopsis (the truth of what's going on)", 4),
      text(plot, "hooks", "Hooks (why the party gets involved)", 2)),
    listSection("Acts / chapters", plot.acts, () => ({ id: uid(), title: "", summary: "" }), (a) => h("div", { class: "grid2" }, text(a, "title", "Title"), text(a, "summary", "Summary", 2)), "+ Add act"),
    listSection("NPCs", plot.npcs, () => ({ id: uid(), name: "", role: "", ancestry: "", description: "", secret: "", location: "" }), (n) => h("div", {},
      h("div", { class: "grid3" }, text(n, "name", "Name"), text(n, "role", "Role"), text(n, "ancestry", "Ancestry")),
      h("div", { class: "grid2" }, text(n, "description", "Description & personality", 2), text(n, "secret", "Secret (GM only)", 2)),
      field("Usually found at", select([{ value: "", label: "—" }, ...plot.locations.map((l) => l.name)], n.location || "", (v) => { n.location = v; save(); }))), "+ Add NPC"),
    listSection("Locations", plot.locations, () => ({ id: uid(), name: "", type: "dungeon", description: "" }), (l) => h("div", {},
      h("div", { class: "grid2" }, text(l, "name", "Name"), field("Map type", select(Object.entries(MAP_TYPES).map(([value, label]) => ({ value, label })), l.type, (v) => { l.type = v; save(); }))),
      text(l, "description", "Description", 2),
      h("div", { class: "row" },
        h("button", { class: "small", onclick: () => onSceneBrief(l) }, "Scene brief"),
        h("button", { class: "small", onclick: () => onMapFor(l) }, "Generate map"))), "+ Add location"),
    listSection("Clues & secrets", plot.secrets, () => ({ id: uid(), text: "", revealed: false, location: "" }), (s) => h("div", {},
      text(s, "text", "Clue / secret", 2),
      h("div", { class: "row" },
        field("Found at", select([{ value: "", label: "—" }, ...plot.locations.map((l) => l.name)], s.location || "", (v) => { s.location = v; save(); })),
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: s.revealed, onchange: (e) => { s.revealed = e.target.checked; save(); } }), " Revealed"),
        h("button", { class: "small", onclick: async () => { s.revealed = true; await saveNow(); await act("addNote", { text: s.text, public: true, tags: ["clue"] }); toast("Shared with players"); } }, "Reveal to players"))), "+ Add clue"),
    h("section", { class: "bsec" }, text(plot, "factions", "Factions", 2), text(plot, "rewards", "Rewards & treasure notes", 2)),
  );

  function importDialog() {
    const ta = h("textarea", { rows: 16, placeholder: `Title: The Lost Mine
Setting: A mining town in the Five Kings Mountains
Level: 2
Synopsis: Kobolds have taken the old mine, but they were driven there by something worse.
Hook: The mine foreman offers a reward.
Act: Into the mine - Find the kobolds and parley.
NPC: Foreman Hadda (quest giver) - gruff dwarf, owes money to the guild
Location: Old Mine [cave] - flooded lower tunnels
Location: Brightvein [town] - the mining town
Clue: The kobolds left tribute for something below.` });
    const m = modal("Import plot from text", h("div", {},
      h("p", { class: "hint" }, "Paste notes using “Key: value” lines. Recognised keys: Title, Setting, Level, Tone, Synopsis, Hook, Act, NPC, Location (add [dungeon|cave|wilderness|town|tavern]), Clue, Faction, Reward. Items are added to what you already have."),
      ta,
      h("button", { class: "primary", onclick: async () => {
        const p = parsePlotText(ta.value);
        for (const k of ["title", "setting", "partyLevel", "tone", "synopsis", "hooks", "factions", "rewards"]) if (p[k]) plot[k] = p[k];
        plot.acts.push(...p.acts); plot.npcs.push(...p.npcs); plot.locations.push(...p.locations); plot.secrets.push(...p.secrets);
        await saveNow(); m.close(); toast("Plot imported"); onReload && onReload();
      } }, "Import")), { wide: true });
  }
  return root;
}
