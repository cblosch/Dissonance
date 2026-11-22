// Prompts for the GM assistant, shared by the server (Claude API) and the
// hosted version (the page's own Claude access).
export const TASKS = {
  ask: "Answer the GM's question about running this game. Be practical and brief. Use Pathfinder Second Edition Remaster rules terms (Player Core, GM Core, Monster Core). If a rule is uncertain, say so and suggest checking Archives of Nethys (2e.aonprd.com).",
  readaloud: "Write boxed read-aloud text the GM can read to the players: 80-150 words, second person, sensory, no decisions made for the players, no secrets revealed.",
  handout: "Write the text of an in-world handout (letter, notice, journal page, poster, etc.). Write only what appears on the document itself, in the voice of whoever wrote it. Include only information the GM says the players should get.",
  npc: "Voice this NPC. Give 3-5 short lines of dialogue the GM can use, plus one line on mannerism. Stay consistent with what the plot says the NPC knows; never volunteer their secret unless the GM says it is revealed.",
  companion: "You control an AI companion character in the party. Given the situation, describe what the companion does on its turn using Pathfinder 2e's three-action economy (e.g. Stride, Strike, Raise a Shield, cast a spell), then one short line of in-character speech. Prefer simple, sensible tactics that support the human players rather than stealing the spotlight.",
  recap: "Write a short session recap (bullet points) from the session notes and recent log, for reading to the players at the start of next session. Leave out anything marked secret or that the players have not discovered.",
  scene: "Help the GM run the next scene: list what's here, who's here, what they want, 2-3 likely player approaches with suggested checks and DCs (use the GM Core DC by level table), and how the scene can end.",
};

export function context(game) {
  const p = game.plot;
  const lines = [
    `Campaign: ${game.name}`,
    p.title && `Adventure: ${p.title}`,
    `Party level: ${p.partyLevel}`,
    p.setting && `Setting: ${p.setting}`,
    p.tone && `Tone: ${p.tone}`,
    p.synopsis && `Synopsis: ${p.synopsis}`,
    p.hooks && `Hooks: ${p.hooks}`,
    p.acts?.length && "Acts:\n" + p.acts.map((a, i) => `  ${i + 1}. ${a.title}: ${a.summary}`).join("\n"),
    p.npcs?.length && "NPCs:\n" + p.npcs.map((n) => `  - ${n.name} (${n.role || "?"}${n.ancestry ? ", " + n.ancestry : ""}): ${n.description || ""}${n.secret ? " SECRET: " + n.secret : ""}`).join("\n"),
    p.locations?.length && "Locations:\n" + p.locations.map((l) => `  - ${l.name} [${l.type}]: ${l.description || ""}`).join("\n"),
    p.factions && `Factions: ${p.factions}`,
    p.secrets?.length && "Secrets and clues:\n" + p.secrets.map((s) => `  - ${s.text}${s.revealed ? " (revealed)" : " (not yet revealed)"}`).join("\n"),
    game.notes.length && "Session notes from the GM (newest last):\n" + game.notes.slice(-40).map((n) => `  - ${n.text}${n.public ? " (shared with players)" : ""}`).join("\n"),
    "Party:\n" + game.slots.filter((s) => s.characterId && game.characters[s.characterId]).map((s) => {
      const c = game.characters[s.characterId];
      return `  - ${c.name}, level ${c.level} ${c.ancestry} ${c.class}${s.type === "companion" ? " (AI companion" + (s.personality ? ": " + s.personality : "") + ")" : ""}`;
    }).join("\n"),
  ];
  return lines.filter(Boolean).join("\n");
}


export const SYSTEM = "You are a helpful assistant to the Game Master of a Pathfinder Second Edition (Remaster) tabletop game. Write in plain prose without markdown headings. Keep answers usable at the table.";

export function userPrompt(game, task, prompt) {
  const instructions = TASKS[task] || TASKS.ask;
  const recent = game.log.filter((l) => l.type !== "roll").slice(-15).map((l) => `${l.who || "System"}: ${l.text || ""}`).join("\n");
  return `${instructions}\n\nRecent table talk:\n${recent || "(none)"}\n\nGM request: ${String(prompt || "").slice(0, 4000)}`;
}
