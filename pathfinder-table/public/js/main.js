import { h, clear, toast, field, MODE } from "./ui.js";
import { init, createGame, gameInfo, joinGame, enter, myGames, forget, onError, isArtifact } from "./transport.js";
import { loadCore } from "./data.js";

const app = document.getElementById("app");
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
  app.append(
    h("div", { class: "landing" },
      h("header", { class: "hero" },
        h("h1", {}, "Pathfinder Table"),
        h("p", {}, "Run Pathfinder Second Edition (Remaster) games for up to six players and a GM: shared maps, handouts, a character builder and GM tools in one place.")),
      error ? h("p", { class: "error" }, error) : null,
      recentBox,
      h("div", { class: "cards" },
        h("section", { class: "card" },
          h("h2", {}, "I'm the GM"),
          h("p", {}, isArtifact
            ? "Start a new game. You'll get a six-letter code to give your players."
            : "Start a new game. You'll get a GM link (keep it private) and a join code for your players."),
          field("Campaign name", name),
          h("button", { class: "primary", onclick: async (e) => {
            e.target.disabled = true;
            try { const r = await createGame(name.value.trim()); go("gm", r.code, { key: r.key, role: "gm" }); }
            catch (err) { toast(err.message, "error"); e.target.disabled = false; }
          } }, "Create game")),
        h("section", { class: "card" },
          h("h2", {}, "I'm a player"),
          h("p", {}, "Enter the join code your GM gave you."),
          field("Join code", code),
          h("button", { class: "primary", onclick: () => code.value.trim() && go("join", code.value.trim().toUpperCase()) }, "Find game"))),
      isArtifact
        ? h("p", { class: "hint" }, "Everyone plays from this same page while signed in to claude.ai. The GM's game runs on the GM's screen, so keep it open during the session; players' actions go through as soon as it is.")
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
          h("span", { class: "tag" }, g.role === "gm" ? "GM" : "Player"),
          h("span", { class: "spacer" }),
          h("button", { class: "small", onclick: async () => { await forget(g.code); landing(); } }, "Remove"))))));
    }
  } catch {}
}

async function joinScreen(code) {
  clear(app);
  let info;
  try { info = await gameInfo(code); }
  catch (e) { return landing(e.message); }
  const mine = info.slots.find((s) => s.mine);
  if (mine) return go("play", code, {});
  const name = h("input", { id: "player-name", placeholder: "Your name", autocomplete: "nickname" });
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
      field("Your name", name),
      h("h3", {}, "Pick a seat"), info.slots.length ? seats : h("p", { class: "muted" }, "The GM hasn't opened this game yet. You can still ask to join; you'll get a seat when they do."),
      h("div", { class: "row" },
        h("button", { onclick: () => goHome() }, "Back"),
        h("button", { class: "primary", onclick: async (e) => {
          e.target.disabled = true;
          try {
            const r = await joinGame(code, name.value.trim(), chosen, info.name);
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
