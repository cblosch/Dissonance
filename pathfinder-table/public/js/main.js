import { h, clear, toast, field, select, MODE, applyTheme, themeToggle, actionSheet, confirmDialog } from "./ui.js";
import { init, createGame, gameInfo, joinGame, enter, myGames, forget, deleteGame, onError, isArtifact, listLibrary } from "./transport.js";
import { libraryPanel, strip } from "./library.js";
import { loadCore } from "./data.js";

const app = document.getElementById("app");
applyTheme();
onError((e) => toast(e.message, "error"));

// ---------------- navigation ----------------
// Server version: routes live in the URL hash (#/gm/CODE?key=…), so links can be shared.
// Hosted version: hashes can't carry paths, so navigation is in-page.
function parseHash() {
  const [path, query] = location.hash.replace(/^#/, "").split("?");
  return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(query || "") };
}

function go(where, code, creds) {
  if (!isArtifact) {
    const q = creds?.key ? `?key=${creds.key}` : creds?.token ? `?token=${creds.token}` : "";
    location.hash = where === "home" ? "#/" : `#/${where === "gm" ? "gm" : where === "play" ? "play" : "join"}/${code}${q}`;
    return;
  }
  show(where, code, creds);
}

async function show(where, code, creds = {}) {
  clear(app);
  if (where === "gm" || where === "play") {
    if (!(await enter(code, { ...creds, role: where === "gm" ? "gm" : "player" }))) {
      return where === "play" ? joinScreen(code) : landing("That game isn't on this account or device. Ask the GM for the code to join as a player.");
    }
    app.append(h("div", { class: "loading" }, "Loading rules data…"));
    await loadCore();
    clear(app);
    if (where === "gm") return (await import("./dm.js")).mountDM(app, { home: () => goHome() });
    return (await import("./player.js")).mountPlayer(app, { home: () => goHome() });
  }
  if (where === "join") return joinScreen(code);
  landing();
}

function goHome() {
  if (isArtifact) location.reload();
  else location.hash = "#/";
}

async function route() {
  if (isArtifact) return show("home");
  const { parts, params } = parseHash();
  if (parts[0] === "gm" && parts[1]) return show("gm", parts[1].toUpperCase(), { key: params.get("key") });
  if (parts[0] === "play" && parts[1]) return show("play", parts[1].toUpperCase(), { token: params.get("token") });
  if (parts[0] === "join" && parts[1]) return show("join", parts[1].toUpperCase());
  show("home");
}

// ---------------- screens ----------------
async function landing(error) {
  clear(app);
  const name = h("input", { id: "new-name", placeholder: "e.g. The Gloomwood Expedition", autocomplete: "off" });
  const code = h("input", { id: "join-code", placeholder: "ABC123", maxlength: 6, autocomplete: "off", autocapitalize: "characters", style: { textTransform: "uppercase" } });
  const recentBox = h("div", {});
  let gmless = false;
  app.append(
    h("div", { class: "landing" },
      h("div", { class: "row end" }, themeToggle()),
      h("header", { class: "hero" },
        h("h1", {}, "Pathfinder Table"),
        h("p", {}, "Run Pathfinder Second Edition (Remaster) games for up to six players and a GM: shared maps, handouts, a character builder and GM tools in one place.")),
      error ? h("p", { class: "error" }, error) : null,
      recentBox,
      libraryPanel(app, { refresh: () => landing() }),
      h("div", { class: "cards" },
        h("section", { class: "card" },
          h("h2", {}, "Start a game"),
          field("Campaign name", name),
          h("div", { class: "mode-pick", role: "radiogroup" },
            h("label", { class: "mode-opt" }, h("input", { type: "radio", name: "mode", value: "gm", checked: true, onchange: () => (gmless = false) }),
              h("span", {}, h("strong", {}, "I'll be the GM"), h("small", {}, isArtifact ? "You run the game; players join with a code." : "You get a private GM link and a join code for players."))),
            h("label", { class: "mode-opt" }, h("input", { type: "radio", name: "mode", value: "nogm", onchange: () => (gmless = true) }),
              h("span", {}, h("strong", {}, "No GM"), h("small", {}, "Everyone plays and shares the GM's jobs: the map reveals as you explore, enemies take their own turns, and an oracle or the AI narrates.")))),
          h("button", { class: "primary", onclick: async (e) => {
            e.target.disabled = true;
            try {
              const r = await createGame(name.value.trim(), { gmless });
              if (r.gmless) go("join", r.code);
              else go("gm", r.code, { key: r.key, role: "gm" });
            } catch (err) { toast(err.message, "error"); e.target.disabled = false; }
          } }, "Create game")),
        h("section", { class: "card" },
          h("h2", {}, "I'm a player"),
          h("p", {}, "Enter the join code your GM gave you."),
          field("Join code", code),
          h("button", { class: "primary", onclick: () => code.value.trim() && go("join", code.value.trim().toUpperCase()) }, "Find game"))),
      isArtifact
        ? h("p", { class: "hint" }, "Everyone plays from this same page while signed in to claude.ai. In a GM game, the GM's screen runs the game, so keep it open during the session. Without a GM, any player's open screen runs it.")
        : h("p", { class: "hint install-hint" }, "On a phone: use your browser's Share or menu button and choose “Add to Home Screen” to open Pathfinder Table like an app."),
      h("footer", {}, "Rules text: Paizo's Pathfinder Remaster books under the ORC license, via the Foundry VTT pf2e dataset. Every rule links to ",
        h("a", { href: "https://2e.aonprd.com/", target: "_blank", rel: "noopener" }, "Archives of Nethys"), " for checking.")));
  try {
    const games = await myGames();
    if (games.length) {
      recentBox.append(h("section", { class: "card recent" },
        h("h2", {}, "Your games"),
        h("ul", { class: "plain" }, games.slice(0, 10).map((g) => h("li", { class: "row" },
          h("button", { class: "link strong", onclick: () => go(g.role === "gm" ? "gm" : "play", g.code, {}) }, `${g.name || "Untitled"} `, h("span", { class: "code" }, g.code)),
          h("span", { class: "tag" }, g.role === "gm" ? "GM" : g.gmless ? "Player · no GM" : "Player"),
          h("span", { class: "spacer" }),
          h("button", { class: "small", onclick: (e) => removeGame(g, e.target.closest("li")) }, "Remove"))))));
    }
  } catch {}
}

// Remove a game from "Your games" (and, for its GM, optionally delete it for everyone).
function removeGame(g, row) {
  const drop = async (fn, done) => {
    const parent = row.parentNode, next = row.nextSibling;
    row.remove();
    if (parent && !parent.children.length) parent.closest(".recent")?.remove();
    try { await fn(g.code); toast(done); }
    catch (err) { parent?.insertBefore(row, next); toast(`Couldn't remove it: ${err.message}`, "error"); }
  };
  const items = [{ icon: "📕", label: "Remove from my list", onClick: () => drop(forget, `${g.name || g.code} removed from your list`) }];
  if (g.role === "gm") items.push({ icon: "🗑", label: "Delete the game for everyone", onClick: async () => {
    if (await confirmDialog(`Delete “${g.name || g.code}” for everyone? Its plot, maps, handouts and seats are gone for good, and players can no longer open it.`, { ok: "Delete game", danger: true }))
      drop(deleteGame, `${g.name || g.code} deleted`);
  } });
  actionSheet(g.name || g.code, items);
}

async function joinScreen(code) {
  clear(app);
  let info;
  try { info = await gameInfo(code); }
  catch (e) { return landing(e.message); }
  const mine = info.slots.find((s) => s.mine);
  if (mine) return go("play", code, {});
  const name = h("input", { id: "player-name", placeholder: "Your name", autocomplete: "nickname" });
  let lib = [];
  try { lib = await listLibrary(); } catch {}
  const charSel = select([{ value: "", label: "Build one after joining" }, ...lib.map((c) => ({ value: c.libId, label: `${c.name || "Unnamed"} (level ${c.level} ${c.ancestry} ${c.class})` }))], "", () => {}, { id: "join-char" });
  let chosen = info.slots.find((s) => s.type === "open")?.index;
  const seats = h("div", { class: "seats" });
  const drawSeats = () => {
    clear(seats);
    for (const s of info.slots) {
      seats.append(h("button", {
        class: `seat ${s.type} ${chosen === s.index ? "chosen" : ""}`, disabled: s.type !== "open" ? "disabled" : null,
        onclick: () => { chosen = s.index; drawSeats(); },
      }, h("strong", {}, `Seat ${s.index + 1}`), h("span", {}, s.type === "open" ? "Open" : s.type === "companion" ? `AI: ${s.character || "companion"}` : `${s.playerName}${s.character ? " · " + s.character : ""}`)));
    }
  };
  drawSeats();
  app.append(h("div", { class: "landing" },
    h("section", { class: "card" },
      h("h2", {}, `Join “${info.name}”`), h("p", { class: "muted" }, `Code ${info.code}`),
      info.gmless ? h("p", { class: "hint" }, "This game has no GM: everyone at the table shares the map, enemies and story.") : null,
      field("Your name", name),
      field("Character", charSel, lib.length ? "Bring one of your saved characters, or build one in the game." : "Saved characters from My characters show up here."),
      h("h3", {}, "Pick a seat"), info.slots.length ? seats : h("p", { class: "muted" }, info.gmless ? "Nobody's at this table yet. Join to take the first seat." : "The GM hasn't opened this game yet. You can still ask to join; you'll get a seat when they do."),
      h("div", { class: "row" },
        h("button", { onclick: () => goHome() }, "Back"),
        h("button", { class: "primary", onclick: async (e) => {
          e.target.disabled = true;
          try {
            const picked = lib.find((c) => c.libId === charSel.value);
            const r = await joinGame(code, name.value.trim(), chosen ?? 0, info.name, picked ? strip(picked) : null);
            go("play", code, { token: r.token });
          } catch (err) { toast(err.message, "error"); e.target.disabled = false; }
        } }, "Join game")),
      isArtifact ? null : h("p", { class: "hint" }, "Already joined on another device? Use the personal link shown in your player view instead of joining again."))));
}

// ---------------- boot ----------------
(async () => {
  app.append(h("div", { class: "loading" }, "Starting…"));
  try { await init(); }
  catch (e) {
    clear(app).append(h("div", { class: "landing" }, h("section", { class: "card" }, h("h2", {}, "Can't start here"), h("p", {}, e.message))));
    return;
  }
  route();
})();

if (!isArtifact) {
  window.addEventListener("hashchange", () => location.reload());
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}
export { MODE };
