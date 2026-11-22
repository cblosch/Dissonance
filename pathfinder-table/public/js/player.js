import { h, clear, tabs, toast, copyText, modal, isMobile, onLayoutChange, actionSheet } from "./ui.js";
import { act, connect, session, shareInfo, canPrint, isArtifact, onWaitingForGM, config, askAI, saveToLibrary } from "./transport.js";
import { pickFromLibrary } from "./library.js";
import { generateMap, MAP_TYPES } from "./map.js";
import { encounterBuilder } from "./dmtools.js";
import { randomAdventure } from "./storygen.js";
import { SAMPLE_PLOT } from "./plot.js";
import { select as selectEl, field, confirmDialog } from "./ui.js";
import { coreData } from "./data.js";
import { createMapView } from "./map.js";
import { createLogPanel, createInitiativePanel } from "./table.js";
import { renderSheet } from "./sheet.js";
import { mountBuilder, blankCharacter } from "./builder.js";
import { renderHandout, printHandout } from "./handouts.js";
import { referencePanel } from "./reference.js";
import { computeCharacter, dcForLevel } from "./shared/rules.js";

export function mountPlayer(app, { home } = {}) {
  let state = null;
  let building = false; // while the builder is open, don't re-render the character tab
  let seenHandouts = new Set(JSON.parse(localStorage.getItem(`pftable.seen.${session.code}`) || "[]"));
  const header = h("header", { class: "topbar" });
  const main = h("main", { class: "main" });
  const side = h("aside", { class: "side" });
  app.append(header, h("div", { class: "layout" }, main, side));
  const iniPanel = createInitiativePanel({ isDM: false });
  const logPanel = createLogPanel({ isDM: false });
  const placePanels = () => { if (!isMobile()) side.append(iniPanel.el, logPanel.el); };
  placePanels();
  onLayoutChange(placePanels);
  let seenLog = 0;
  const unreadLog = () => (isMobile() && tabset?.current !== "play" && state ? Math.min(99, state.log.length - seenLog) : 0);
  // Re-render without losing scroll position, typed text or focus.
  const keepScroll = (fn) => {
    const y = window.scrollY, m = main.scrollTop;
    const vals = {};
    main.querySelectorAll("input[id], textarea[id], select[id]").forEach((el) => { if (el.type !== "file") vals[el.id] = el.type === "checkbox" ? el.checked : el.value; });
    const focused = document.activeElement?.id;
    fn();
    for (const [k, v] of Object.entries(vals)) { const el = document.getElementById(k); if (el && main.contains(el)) { if (el.type === "checkbox") el.checked = v; else el.value = v; } }
    if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
    main.scrollTop = m; window.scrollTo(0, y);
  };
  let shownMapId = null;

  const myChar = () => {
    const s = state.slots[state.me.slot];
    return s?.characterId ? state.characters[s.characterId] : null;
  };

  const mapView = createMapView({
    isDM: false,
    mySlot: null,
    onTokenMove: (t, x, y) => act("token", { op: "move", id: t.id, x, y }).catch((e) => toast(e.message, "error")),
  });

  let pendingSave = null; // { draft, prev } while the GM's game applies a save
  function characterTab() {
    const c = myChar();
    const box = h("div", {});
    if (pendingSave && !building) {
      if (c && c.updatedAt && c.updatedAt !== pendingSave.prev) { pendingSave = null; toast("Character saved"); }
      else {
        const draft = pendingSave.draft;
        box.append(h("div", { class: "empty" }, h("h3", {}, "Saving your character…"),
          h("p", {}, "It appears here as soon as the GM's game has it. If the GM's screen isn't open, it's saved when they open it."),
          h("button", { onclick: () => { pendingSave = null; building = true; draftChar = draft; tabset.refresh(); } }, "Keep editing")));
        return box;
      }
    }
    if (!c || building) {
      building = true;
      if (!c) box.append(h("div", { class: "bsec row wrap between" },
        h("p", { class: "hint" }, `Build a character for level ${state.plot.partyLevel || 1}${state.gmless ? "" : " (the GM's party level)"}, or bring one you saved in My characters.`),
        h("button", { class: "primary", onclick: useSaved }, "Use a saved character")));
      const start = draftChar || c || blankCharacter(+state.plot.partyLevel || 1);
      draftChar = null;
      mountBuilder(box, start, {
        title: c ? `Edit ${c.name}` : "Create your character",
        onSave: async (char) => {
          try {
            pendingSave = { draft: char, prev: c?.updatedAt || null };
            await act("saveCharacter", { character: { ...char, live: c?.live } });
            building = false;
            setTimeout(() => tabset.refresh(), 50);
          } catch (e) { pendingSave = null; toast(e.message, "error"); }
        },
        onCancel: c ? () => { building = false; tabset.refresh(); } : null,
      });
      return box;
    }
    box.append(renderSheet(c, { editable: true, onEdit: () => { building = true; tabset.refresh(); } }),
      h("div", { class: "row wrap sheet-lib" },
        h("button", { class: "small", onclick: async () => { try { await saveToLibrary(c); toast(`Saved a copy of ${c.name} to My characters`); } catch (e) { toast(e.message, "error"); } } }, "Save a copy to My characters"),
        h("button", { class: "small", onclick: async () => { if (await confirmDialog(`Swap ${c.name} for one of your saved characters? ${c.name}'s progress in this game is replaced (save a copy first if you want to keep it).`, { ok: "Choose character" })) useSaved(); } }, "Swap in a saved character")));
    return box;
  }
  let draftChar = null;
  async function useSaved() {
    const pick = await pickFromLibrary("Bring a saved character");
    if (!pick) return;
    const c = myChar();
    pendingSave = { draft: pick, prev: c?.updatedAt || null };
    building = false;
    try { await act("saveCharacter", { character: { ...pick, live: undefined } }); } catch (e) { pendingSave = null; toast(e.message, "error"); }
    tabset.refresh();
  }

  function tableTools() {
    if (!state.gmless) return null;
    let type = "dungeon";
    return h("div", { class: "row wrap scroll-row table-tools" },
      state.maps?.length ? selectEl([{ value: "", label: "— map —" }, ...state.maps.map((m) => ({ value: m.id, label: m.name }))], state.activeMapId || "", (v) => v && act("setActiveMap", { id: v })) : null,
      selectEl(Object.entries(MAP_TYPES).map(([value, label]) => ({ value, label })), type, (v) => (type = v)),
      h("button", { class: "small", onclick: () => newMap(type) }, "+ New map"),
      state.map ? h("button", { class: "small", onclick: () => act("placeParty") }, "Place party") : null,
      state.map ? h("button", { class: "small", onclick: async () => (await confirmDialog("Reveal the whole map for everyone?", { ok: "Reveal all" })) && act("fog", { mapId: state.map.id, all: true }) }, "Reveal all") : null);
  }
  async function newMap(type, name) {
    const m = generateMap(type, undefined, { name: name || MAP_TYPES[type] });
    await act("saveMap", { map: m, activate: true });
    await act("placeParty").catch(() => {});
    tabset.select("map");
  }

  function mapTab() {
    if (!state.map) return h("div", {}, tableTools(), h("div", { class: "empty" }, h("p", {}, state.gmless ? "No map yet. Pick a map type above and tap “New map”: the party is placed at the entrance and the map reveals itself as you explore." : "The GM hasn't shown a map yet.")));
    mapView.setMap(state.map);
    mapView.setCoGM(!!state.me?.coGM);
    shownMapId = state.map.id;
    return h("div", {}, tableTools(), h("h3", { class: "map-title" }, state.map.name), mapView.el,
      h("p", { class: "hint" }, "Drag your token, or tap it and then tap where it should go. Drag empty space to pan; pinch or use − / + to zoom. You only see what the GM has revealed. 📏 Measure shows distance in feet (every second diagonal costs 10 ft)."));
  }

  function handoutsTab() {
    const box = h("div", { class: "handout-grid" });
    if (!state.handouts.length) box.append(h("p", { class: "muted" }, "No handouts yet."));
    for (const ho of state.handouts.slice().reverse()) {
      seenHandouts.add(ho.id);
      box.append(h("div", { class: "handout-card" }, renderHandout(ho), canPrint ? h("button", { class: "small", onclick: () => printHandout(ho) }, "Print") : null));
    }
    try { localStorage.setItem(`pftable.seen.${session.code}`, JSON.stringify([...seenHandouts])); } catch {}
    return box;
  }

  function partyTab() {
    const data = coreData();
    const grid = h("div", { class: "seat-grid" });
    for (const s of state.slots) {
      const c = s.characterId ? state.characters[s.characterId] : null;
      if (!c) { grid.append(h("div", { class: `seat-card ${s.type}` }, h("strong", {}, `Seat ${s.index + 1}`), h("p", { class: "muted" }, s.type === "open" ? "Open" : `${s.playerName} is building a character…`))); continue; }
      const comp = computeCharacter(c, data);
      grid.append(h("div", { class: `seat-card ${s.type}` },
        h("div", { class: "row between" }, h("strong", {}, c.name), h("span", { class: "tag" }, s.type === "companion" ? "AI companion" : s.playerName)),
        h("p", { class: "muted" }, `Level ${c.level} ${c.ancestry} ${c.class}`),
        h("p", {}, `HP ${c.live?.hp ?? comp.maxHp}/${comp.maxHp} · AC ${comp.ac}`),
        (c.live?.conditions || []).length ? h("p", { class: "warn" }, c.live.conditions.map((x) => x.name + (x.value ? " " + x.value : "")).join(", ")) : null,
        h("button", { class: "small", onclick: () => modal(c.name, renderSheet(c, { editable: false }), { wide: true }) }, "View sheet")));
    }
    return grid;
  }

  function notesTab() {
    const box = h("div", {});
    if (state.plot.setting) box.append(h("section", { class: "bsec" }, h("h3", {}, state.plot.title || "The adventure"), h("p", {}, state.plot.setting)));
    box.append(h("h3", {}, "What the GM has shared"));
    if (!state.notes.length) box.append(h("p", { class: "muted" }, "Nothing yet."));
    for (const n of state.notes.slice().reverse()) box.append(h("div", { class: "note public" }, h("small", { class: "muted" }, new Date(n.ts).toLocaleString()), h("p", { class: "pre" }, n.text)));
    return box;
  }

  const unseen = () => state ? state.handouts.filter((x) => !seenHandouts.has(x.id)).length : 0;
  let tabset;
  const makeTabs = () => tabs([
    { id: "character", label: "Character", icon: "🧙", short: "Hero", primary: true, render: characterTab },
    { id: "map", label: "Map", icon: "🗺️", primary: true, render: mapTab },
    { id: "play", label: "Initiative & chat", icon: "💬", short: "Play", primary: true, mobileOnly: true, badge: unreadLog, render: playTab },
    ...(state.gmless ? [
      { id: "story", label: "Story", icon: "📖", primary: true, render: storyTab },
      { id: "fight", label: "Fight", icon: "⚔️", render: () => encounterBuilder(state, { onSpawn: (creatures) => act("spawnEncounter", { creatures }).then(() => { toast("The fight is on! See initiative."); tabset.select(isMobile() ? "play" : "map"); }).catch((e) => toast(e.message, "error")) }) },
    ] : []),
    { id: "handouts", label: "Handouts", icon: "📜", primary: !state.gmless, badge: () => unseen(), render: handoutsTab },
    { id: "party", label: "Party", icon: "👥", render: partyTab },
    { id: "notes", label: "Journal", icon: "📓", render: notesTab },
    { id: "rules", label: "Rules", icon: "📚", render: () => referencePanel({ isDM: false }) },
  ], { persistKey: `pftable.ptab.${session.code}`, onChange: (id) => { if (id === "play") { seenLog = state.log.length; logPanel.scrollDown(); } drawHeader(); tabset.updateBar(); } });

  let aiOn = null;
  config().then((c) => { aiOn = !!c.ai; if (tabset?.current === "story") tabset.refresh(); }).catch(() => (aiOn = false));
  function storyTab() {
    const p = state.plot || {};
    const box = h("div", { class: "story" });
    const lvl = +p.partyLevel || Math.max(1, ...Object.values(state.characters).map((c) => c.level || 1));
    if (!p.title) {
      box.append(h("section", { class: "bsec" }, h("h3", {}, "Pick an adventure"),
        h("p", {}, "There's no GM, so the table picks the story. Everyone can read it, so the truth stays behind a spoiler fold."),
        h("div", { class: "row wrap" },
          h("button", { class: "primary", onclick: () => act("setPlot", { plot: { ...randomAdventure(lvl) } }) }, "🎲 Random adventure"),
          h("button", { onclick: () => act("setPlot", { plot: { ...structuredClone(SAMPLE_PLOT), partyLevel: lvl } }) }, "The Lanterns of Hollowmere (sample)"),
          aiOn ? h("button", { onclick: async (e) => {
            e.target.disabled = true; e.target.textContent = "Writing…";
            try {
              const r = await askAI("adventure", `Party level ${lvl}.`);
              const m = r.text.match(/\{[\s\S]*\}/);
              const plot = JSON.parse(m ? m[0] : r.text);
              const uid = () => Math.random().toString(36).slice(2, 9);
              for (const k of ["acts", "npcs", "locations", "secrets"]) plot[k] = (plot[k] || []).map((x) => ({ id: uid(), ...x }));
              await act("setPlot", { plot: { ...plot, partyLevel: lvl } });
            } catch (err) { toast("The AI's adventure couldn't be read. Try again or roll a random one.", "error"); }
            e.target.disabled = false; e.target.textContent = "✨ Let the AI write one";
          } }, "✨ Let the AI write one") : null)));
    } else {
      box.append(h("section", { class: "bsec" },
        h("h3", {}, p.title), p.setting ? h("p", {}, p.setting) : null, p.hooks ? h("p", {}, h("strong", {}, "Hook: "), p.hooks) : null,
        h("details", { class: "spoiler" }, h("summary", {}, "Spoilers: what's really going on"),
          p.synopsis ? h("p", {}, p.synopsis) : null,
          (p.npcs || []).length ? h("ul", {}, p.npcs.map((n) => h("li", {}, h("strong", {}, n.name), ` (${n.role || ""}): ${n.description || ""}`, n.secret ? h("em", { class: "secret" }, ` ${n.secret}`) : null))) : null,
          (p.secrets || []).length ? h("ul", {}, p.secrets.map((x) => h("li", {}, x.text))) : null),
        (p.acts || []).length ? [h("h4", {}, "Chapters"), h("ol", {}, p.acts.map((a) => h("li", {}, h("strong", {}, a.title), a.summary ? `: ${a.summary}` : "")))] : null,
        (p.locations || []).length ? [h("h4", {}, "Places"), h("div", { class: "row wrap" }, p.locations.map((l) => h("button", { class: "small", title: l.description || "", onclick: () => newMap(l.type || "dungeon", l.name) }, `🗺 ${l.name}`)))] : null,
        h("p", { class: "hint" }, "Tap a place to make its map and put the party there."),
        h("button", { class: "small", onclick: async () => (await confirmDialog("Start a different adventure? The current plot is replaced.", { ok: "Change adventure" })) && act("setPlot", { plot: { title: "", synopsis: "", setting: "", hooks: "", acts: [], npcs: [], locations: [], secrets: [] } }) }, "Change adventure")));
    }
    // narrator
    const say = h("textarea", { id: "story-say", rows: 3, placeholder: "What do you do? e.g. I search the altar for hidden compartments." });
    const q = h("input", { id: "oracle-q", placeholder: "Yes/no question, e.g. Is the door locked?" });
    const odds = selectEl(["Almost certain", "Likely", "50/50", "Unlikely", "Very unlikely"], "50/50", () => {}, { id: "oracle-odds" });
    const me = myChar();
    box.append(h("section", { class: "bsec" }, h("h3", {}, aiOn ? "Ask the AI narrator" : "Run the scene"),
      aiOn ? [
        say,
        h("div", { class: "row wrap" },
          h("button", { class: "primary", onclick: async (e) => {
            const text = say.value.trim();
            if (!text) return;
            e.target.disabled = true;
            try {
              await act("chat", { text });
              const r = await askAI("narrate", `${me ? me.name + " (" + me.ancestry + " " + me.class + ")" : "A player"}: ${text}`);
              await act("chat", { text: r.text, as: "AI narrator" });
              say.value = "";
            } catch (err) { toast(err.message, "error"); }
            e.target.disabled = false;
          } }, "Send to narrator"),
          h("button", { onclick: async (e) => { e.target.disabled = true; try { const r = await askAI("narrate", "Describe the current scene for the party and what they notice."); await act("chat", { text: r.text, as: "AI narrator" }); } catch (err) { toast(err.message, "error"); } e.target.disabled = false; } }, "Describe the scene")),
        h("p", { class: "hint" }, "The narrator's replies go to the chat for everyone, and it asks for checks with DCs when the outcome is uncertain."),
      ] : h("p", { class: "hint" }, "Take turns describing what happens. When nobody knows the answer, ask the oracle; when things are too easy, roll a complication."),
      h("h4", {}, "Oracle"),
      h("div", { class: "row wrap" }, q, odds, h("button", { onclick: () => { act("oracle", { question: q.value.trim(), likelihood: odds.value }); q.value = ""; } }, "Ask"),
        h("button", { onclick: () => act("complication") }, "Roll a complication")),
      h("p", { class: "hint" }, `Checks without a GM: for a level ${lvl} party a standard DC is ${dcForLevel(lvl)} (easy ${dcForLevel(lvl) - 2}, hard ${dcForLevel(lvl) + 2}).`)));
    // shared log of what happened
    const note = h("input", { id: "story-note", placeholder: "Record what happened (everyone sees it)" });
    box.append(h("section", { class: "bsec" }, h("h3", {}, "Story so far"),
      h("div", { class: "row" }, note, h("button", { onclick: () => { if (note.value.trim()) { act("addNote", { text: note.value.trim() }); note.value = ""; } } }, "Add")),
      state.notes.length ? h("ul", { class: "plain" }, state.notes.slice().reverse().slice(0, 30).map((n) => h("li", { class: "note public" }, n.text))) : h("p", { class: "muted" }, "Nothing recorded yet.")));
    return box;
  }

  function playTab() {
    seenLog = state.log.length;
    logPanel.scrollDown();
    return h("div", { class: "play-tab" }, iniPanel.el, logPanel.el);
  }

  let first = true;
  const waitBox = h("div", { class: "empty" }, h("h3", {}, "Waiting for the GM"),
    h("p", {}, "Your request to join has been sent. You'll get your seat as soon as the GM has the game open."),
    h("button", { onclick: () => home && home() }, "Back to start"));
  onWaitingForGM(() => { if (first) clear(main).append(waitBox); });
  connect((s) => {
    if (first) clear(main);
    const prevHandouts = state?.handouts.length || 0;
    state = s;
    mapView.setSlot(s.me.slot);
    drawHeader();
    iniPanel.update(state);
    logPanel.update(state);
    if (first) { seenLog = state.log.length; tabset = makeTabs(); main.append(tabset.el); first = false; return; }
    if (state.handouts.length > prevHandouts && tabset.current !== "handouts") toast("📜 You received a handout!");
    const cur = tabset.current;
    if (cur === "play") seenLog = state.log.length;
    tabset.updateBar();
    if (cur === "play" || cur === "rules" || cur === "fight") return;
    if (cur === "character" && building) return;
    if (cur === "map" && state.map && state.map.id === shownMapId) { mapView.setMap(state.map); return; }
    keepScroll(() => tabset.refresh());
  }, () => {
    clear(app).append(h("div", { class: "landing" }, h("section", { class: "card" }, h("h2", {}, "You've left this game"), h("p", {}, "The GM freed your seat."), h("button", { onclick: () => home && home() }, "Back to start"))));
  });

  function drawHeader() {
    if (!state) return;
    const c = myChar();
    const n = unseen();
    const share = shareInfo(state);
    clear(header).append(
      h("button", { class: "brand link", onclick: () => home && home() }, "Pathfinder Table"),
      h("span", { class: "title" }, state.name),
      h("span", { class: "tag" }, `Seat ${state.me.slot + 1}${c ? " · " + c.name : ""}`),
      n && !isMobile() ? h("button", { class: "small primary", onclick: () => tabset.select("handouts") }, `📜 ${n} new`) : null,
      h("span", { class: "spacer" }),
      share.private ? h("span", { class: "top-actions" }, h("button", { class: "small", title: "Open your seat on another device", onclick: () => copyText(share.private) }, "Copy my personal link")) : null,
      h("button", { class: "icon-btn menu-btn", title: "Menu", onclick: () => actionSheet(state.name, [
        share.private ? { icon: "🔗", label: share.privateLabel, onClick: () => copyText(share.private) } : null,
        { icon: "🏠", label: "Back to start", onClick: () => home && home() },
      ]) }, "⋯"));
  }
}
