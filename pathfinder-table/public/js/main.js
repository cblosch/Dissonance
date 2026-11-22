import { h, clear, toast, field } from "./ui.js";
import { api, session, rememberSession, recallSessions, forgetSession } from "./api.js";
import { loadCore } from "./data.js";

const app = document.getElementById("app");

function parseHash() {
  const [path, query] = location.hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query || "");
  const parts = path.split("/").filter(Boolean);
  return { parts, params };
}

async function route() {
  const { parts, params } = parseHash();
  clear(app);
  document.body.className = "";
  if (parts[0] === "gm" && parts[1]) {
    const code = parts[1].toUpperCase();
    const key = params.get("key") || recallSessions()[code]?.key;
    if (!key) return landing("That GM link is missing its key.");
    Object.assign(session, { code, key, token: null, role: "dm" });
    rememberSession(code, { key, name: recallSessions()[code]?.name });
    app.append(h("div", { class: "loading" }, "Loading rules data…"));
    await loadCore();
    const { mountDM } = await import("./dm.js");
    clear(app);
    return mountDM(app);
  }
  if (parts[0] === "play" && parts[1]) {
    const code = parts[1].toUpperCase();
    const token = params.get("token") || recallSessions()[code]?.token;
    if (!token) return joinScreen(code);
    Object.assign(session, { code, key: null, token, role: "player" });
    rememberSession(code, { token });
    app.append(h("div", { class: "loading" }, "Loading rules data…"));
    await loadCore();
    const { mountPlayer } = await import("./player.js");
    clear(app);
    return mountPlayer(app);
  }
  if (parts[0] === "join" && parts[1]) return joinScreen(parts[1].toUpperCase());
  landing();
}

function landing(error) {
  const name = h("input", { placeholder: "e.g. The Gloomwood Expedition" });
  const code = h("input", { placeholder: "ABC123", maxlength: 6, style: { textTransform: "uppercase" } });
  const recent = Object.entries(recallSessions()).sort((a, b) => b[1].at - a[1].at).slice(0, 8);
  app.append(
    h("div", { class: "landing" },
      h("header", { class: "hero" },
        h("h1", {}, "Pathfinder Table"),
        h("p", {}, "Run Pathfinder Second Edition (Remaster) games for up to six players and a GM: shared maps, handouts, a character builder and GM tools in one place.")),
      error ? h("p", { class: "error" }, error) : null,
      h("div", { class: "cards" },
        h("section", { class: "card" },
          h("h2", {}, "I'm the GM"),
          h("p", {}, "Start a new game. You'll get a GM link (keep it private) and a join code for your players."),
          field("Campaign name", name),
          h("button", { class: "primary", onclick: async () => {
            try {
              const r = await api("/api/games", { method: "POST", body: { name: name.value } });
              rememberSession(r.code, { key: r.key, name: name.value || "New Campaign" });
              location.hash = `#/gm/${r.code}?key=${r.key}`;
            } catch (e) { toast(e.message, "error"); }
          } }, "Create game")),
        h("section", { class: "card" },
          h("h2", {}, "I'm a player"),
          h("p", {}, "Enter the join code your GM gave you."),
          field("Join code", code),
          h("button", { class: "primary", onclick: () => code.value.trim() && (location.hash = `#/join/${code.value.trim().toUpperCase()}`) }, "Find game"))),
      recent.length ? h("section", { class: "card recent" },
        h("h2", {}, "Your recent games on this device"),
        h("ul", {}, recent.map(([c, s]) => h("li", {},
          h("a", { href: s.key ? `#/gm/${c}?key=${s.key}` : `#/play/${c}?token=${s.token}` }, `${c} ${s.name ? "· " + s.name : ""}`),
          h("span", { class: "tag" }, s.key ? "GM" : "Player"),
          h("button", { class: "link", onclick: () => { forgetSession(c); route(); } }, "forget"))))) : null,
      h("p", { class: "hint install-hint" }, "On a phone: use your browser's Share or menu button and choose “Add to Home Screen” to open Pathfinder Table like an app."),
      h("footer", {}, "Rules text: Paizo's Pathfinder Remaster books under the ORC license, via the Foundry VTT pf2e dataset. Every rule links to ",
        h("a", { href: "https://2e.aonprd.com/", target: "_blank", rel: "noopener" }, "Archives of Nethys"), " for checking.")));
}

async function joinScreen(code) {
  clear(app);
  let info;
  try { info = await api(`/api/games/${code}/info`); }
  catch (e) { return landing(e.message); }
  const name = h("input", { placeholder: "Your name" });
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
      h("h3", {}, "Pick a seat"), seats,
      h("button", { class: "primary", onclick: async () => {
        try {
          const r = await api(`/api/games/${code}/join`, { method: "POST", body: { name: name.value, slot: chosen } });
          rememberSession(code, { token: r.token, name: info.name });
          location.hash = `#/play/${code}?token=${r.token}`;
        } catch (e) { toast(e.message, "error"); }
      } }, "Join game"),
      h("p", { class: "hint" }, "Already joined on another device? Use the personal link shown in your player view instead of joining again."))));
}

window.addEventListener("hashchange", () => location.reload());
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
route();
