import { h, clear, tabs, toast, copyText, modal } from "./ui.js";
import { act, connect, session, forgetSession } from "./api.js";
import { coreData } from "./data.js";
import { createMapView } from "./map.js";
import { logPanel, initiativePanel } from "./table.js";
import { renderSheet } from "./sheet.js";
import { mountBuilder, blankCharacter } from "./builder.js";
import { renderHandout, printHandout } from "./handouts.js";
import { referencePanel } from "./reference.js";
import { computeCharacter } from "./shared/rules.js";

export function mountPlayer(app) {
  let state = null;
  let building = false; // while the builder is open, don't re-render the character tab
  let seenHandouts = new Set(JSON.parse(localStorage.getItem(`pftable.seen.${session.code}`) || "[]"));
  const header = h("header", { class: "topbar" });
  const main = h("main", { class: "main" });
  const sideIni = h("div", {});
  const sideLog = h("div", { class: "grow" });
  app.append(header, h("div", { class: "layout" }, main, h("aside", { class: "side" }, sideIni, sideLog)));

  const myChar = () => {
    const s = state.slots[state.me.slot];
    return s?.characterId ? state.characters[s.characterId] : null;
  };

  const mapView = createMapView({
    isDM: false,
    mySlot: null,
    onTokenMove: (t, x, y) => act("token", { op: "move", id: t.id, x, y }).catch((e) => toast(e.message, "error")),
  });

  function characterTab() {
    const c = myChar();
    const box = h("div", {});
    if (!c || building) {
      building = true;
      if (!c) box.append(h("p", { class: "hint" }, `Build your character for level ${state.plot.partyLevel || 1} (the GM's party level). Everything is checked against Player Core / Player Core 2 rules; each choice links to Archives of Nethys.`));
      mountBuilder(box, c || blankCharacter(+state.plot.partyLevel || 1), {
        title: c ? `Edit ${c.name}` : "Create your character",
        onSave: async (char) => {
          try {
            await act("saveCharacter", { character: { ...char, live: c?.live } });
            building = false;
            toast("Character saved");
            setTimeout(() => tabset.refresh(), 200);
          } catch (e) { toast(e.message, "error"); }
        },
        onCancel: c ? () => { building = false; tabset.refresh(); } : null,
      });
      return box;
    }
    box.append(renderSheet(c, { editable: true, onEdit: () => { building = true; tabset.refresh(); } }));
    return box;
  }

  function mapTab() {
    if (!state.map) return h("div", { class: "empty" }, h("p", {}, "The GM hasn't shown a map yet."));
    mapView.setMap(state.map);
    return h("div", {}, h("h3", {}, state.map.name), mapView.el,
      h("p", { class: "hint" }, "Drag your own token with ✋ Move. You only see what the GM has revealed. 📏 Measure shows distance in feet (every second diagonal costs 10 ft)."));
  }

  function handoutsTab() {
    const box = h("div", { class: "handout-grid" });
    if (!state.handouts.length) box.append(h("p", { class: "muted" }, "No handouts yet."));
    for (const ho of state.handouts.slice().reverse()) {
      seenHandouts.add(ho.id);
      box.append(h("div", { class: "handout-card" }, renderHandout(ho), h("button", { class: "small", onclick: () => printHandout(ho) }, "Print")));
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
    { id: "character", label: "Character", render: characterTab },
    { id: "map", label: "Map", render: mapTab },
    { id: "handouts", label: "Handouts", render: handoutsTab },
    { id: "party", label: "Party", render: partyTab },
    { id: "notes", label: "Journal", render: notesTab },
    { id: "rules", label: "Rules", render: () => referencePanel({ isDM: false }) },
  ], { persistKey: `pftable.ptab.${session.code}`, onChange: () => drawHeader() });

  let first = true;
  connect((s) => {
    const prevHandouts = state?.handouts.length || 0;
    state = s;
    mapView.setSlot(s.me.slot);
    drawHeader();
    clear(sideIni).append(initiativePanel(state, { isDM: false }));
    clear(sideLog).append(logPanel(state, { isDM: false }));
    if (first) { tabset = makeTabs(); main.append(tabset.el); first = false; return; }
    if (state.handouts.length > prevHandouts && tabset.current !== "handouts") toast("📜 You received a handout!");
    const cur = tabset.current;
    if (cur === "character" && building) return;
    if (cur === "rules") return;
    const y = main.scrollTop; tabset.refresh(); main.scrollTop = y;
  }, () => {
    forgetSession(session.code);
    clear(app).append(h("div", { class: "landing" }, h("section", { class: "card" }, h("h2", {}, "You've left this game"), h("p", {}, "The GM freed your seat."), h("a", { href: "#/" }, "Back to start"))));
  });

  function drawHeader() {
    if (!state) return;
    const c = myChar();
    const n = unseen();
    clear(header).append(
      h("a", { href: "#/", class: "brand" }, "Pathfinder Table"),
      h("span", { class: "title" }, state.name),
      h("span", { class: "tag" }, `Seat ${state.me.slot + 1}${c ? " · " + c.name : ""}`),
      n ? h("button", { class: "small primary", onclick: () => tabset.select("handouts") }, `📜 ${n} new`) : null,
      h("span", { class: "spacer" }),
      h("button", { class: "small", title: "Open your seat on another device", onclick: () => copyText(`${location.origin}/#/play/${state.code}?token=${session.token}`) }, "Copy my personal link"));
  }
}
