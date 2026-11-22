# Pathfinder Table

A web app for running **Pathfinder Second Edition (Remaster)** games with up to six players and a GM. The GM and players join separately from their own browsers, everything stays in sync live, and empty seats can be filled with AI companions.

## Running it

Requires Node.js 18 or newer. No build step.

```bash
cd pathfinder-table
npm install        # only needed for the optional AI assistant
npm start          # http://localhost:3000
```

- **GM:** open the site, enter a campaign name, click **Create game**. Keep the GM link private (it's the key to the game) and share the six-letter join code or invite link.
- **Players:** open the invite link (or enter the code on the home page), type a name and pick a seat.
- To play over the internet, run it on a machine your players can reach (or behind a tunnel such as `cloudflared` / `ngrok`) and share that address.

Games are saved as JSON in `data/games/` (change with `PF_TABLE_DATA`). `PORT` sets the port. The GM can download a full export from the header.

### Optional AI assistant

With an Anthropic API key, the GM gets an assistant that writes read-aloud text, handout text, NPC dialogue, scene plans, session recaps and AI-companion turns, using the plot, NPC secrets, session notes and recent chat as context:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

It uses `claude-opus-5-5` by default (`PF_TABLE_MODEL` overrides it). Players never see the assistant. Everything else works without it.

## Hosted version (no server)

`artifact/page.html` plus `public/` is published as a claude.ai artifact, so the app runs from a link with nothing to install. In that version:

- Everyone signs in to claude.ai and opens the same link. Players need edit access to the artifact (Share menu) so their moves can be saved.
- The GM's open page runs the game. It keeps the full game, including plot secrets and unrevealed maps, in the GM's private storage, and publishes each player's filtered view. Players' actions queue up and apply as soon as the GM's page is open.
- The AI assistant uses the viewer's own Claude access, so no API key is needed. Exports go through a download prompt. Printing isn't available there.
- `public/js/cloud.js` is this transport; `public/js/api.js` is the server one; `transport.js` picks between them.

## Phones and tablets

The same app adapts to the screen. On phones (up to 760px wide):

- A bottom navigation bar holds the main tabs (players: Hero, Map, Play, Handouts; GM: Map, Play, Party, Notes). Everything else is under **More**. Header actions (invite link, GM link, export) move into the **⋯** menu.
- **Play** is a phone-only tab holding the initiative tracker, dice and chat, with an unread badge.
- Maps: drag empty space to pan, pinch to zoom, and tap a token then tap a square to move it. Maps open zoomed to readable squares and centered on your token (players) or the explored area (GM); **Fit** shows the whole map and **◎** re-centers.
- The character builder keeps a collapsible stat bar (HP, AC, choices left) above the bottom navigation; tap it to expand the full summary.
- Dialogs open full screen, inputs use 16px text so iOS doesn't zoom, and layouts respect the notch and home-indicator safe areas.
- It can be installed: use the browser's **Add to Home Screen**. The app shell and rules data are cached by a service worker; game state always comes live from the server, so an internet connection to your game server is still needed to play.

Tablets keep the desktop layout with a narrower side panel.

## What's in it

### Seats, players and AI companions
- Six player seats plus the GM. Players pick a seat; each gets a personal link to rejoin from another device.
- The GM can kick a player, or **fill any open seat with an AI companion**: a complete, rules-valid character built at the party level (the tool suggests a class the party is missing). Companions show up in initiative with a **suggest turn** button that proposes a sensible three-action turn from their sheet and the map, with one-click attack and damage rolls. With the AI assistant on, the GM can have Claude play the turn in character.

### Plot and live information
- The **Plot** tab holds the adventure: title, setting, party level, tone, synopsis, hooks, acts, NPCs (with secrets and usual location), locations (with map type), clues/secrets, factions and rewards.
- **Import from text**: paste notes as `Key: value` lines (`NPC: Name (role) - description`, `Location: Name [cave] - description`, `Clue: ...`). A sample adventure is included to try things out.
- **Notes** let the GM record what happens during play. Any note or clue can be shared with players in one click; shared notes appear in the players' Journal.

### Maps
- Procedural generators for **dungeons, caves, wilderness, towns and tavern interiors** on a 5-foot grid, with seeds so a map can be regenerated.
- **Fog of war:** players only receive revealed squares from the server, so unexplored rooms can't be read from the browser. Reveal by brush, by room, all at once, or by line of sight around the party.
- Tokens (party, enemies, NPCs; Large to Gargantuan sizes; hidden until revealed), labels (GM-only or public), terrain painting, and a measuring tool that uses PF2e diagonal movement (every second diagonal costs 10 ft). Players drag their own token on revealed squares.

### Handouts
- Letters, wanted posters/notices, journal pages, prophecies, clue notes, item cards, creature lore cards, NPC cards and map fragments (cut from the current map), on a parchment style.
- **Suggest from plot** drafts handouts from the NPCs, locations and clues you entered. The GM edits them, then gives them to everyone or to specific seats. Every handout can be printed.

### GM tools
- **Encounter builder** with GM Core XP budgets adjusted for party size, the Monster Core / Monster Core 2 / NPC Core bestiary (1,200 creatures, full stat blocks), automatic encounter suggestions themed to the location, and one-click "add to initiative" (rolls Perception) or "place tokens on the map".
- **Scene briefs** for each location: who's there, linked clues, your notes, level-appropriate DCs, and buttons to make the map or a handout.
- **DC helper** (DCs by level, difficulty adjustments, rarity), **NPC generator**, and **treasure generator** based on the GM Core treasure-by-level table.
- **Initiative tracker** with hidden entries, HP and conditions. Players see enemies' state ("wounded", "bloodied") but not exact HP or AC.

### Character builder (Player Core and Player Core 2)
- 16 ancestries with heritages (plus versatile heritages), 63 backgrounds and the 16 Player Core / Player Core 2 classes with their subclass choices (muses, doctrines, rackets, bloodlines, patrons, arcane schools and so on).
- Levels 1-20: ancestry boosts (including the alternate two-free-boost option), background, class key attribute, free boosts and level 5/10/15/20 boosts with partial boosts above +4; trained skills and skill increases with rank limits; ancestry, class, skill and general feat slots by level with prerequisite hints; spell selection by tradition with default slot counts; armor, shields, weapons with fundamental runes, and gear.
- Live stat calculation (HP, AC, saves, Perception, skills with armor check penalties, strikes with multiple attack penalties and weapon specialization, class DC, spell attack and DC) and a checklist of unfinished choices. A **random build** button makes a complete character.
- The character sheet tracks HP, temp HP, hero points, dying/wounded, conditions and spell slots, and every number is clickable to roll. Rolls happen on the server so everyone sees the same result, with optional DCs (showing the degree of success) and secret/private rolls.

### Rules reference and Archives of Nethys
- A searchable reference (shared with players, minus the bestiary) for conditions, actions, feats, spells, items, weapons, armor, ancestries, classes and backgrounds, plus a quick-rules page.
- Every rules entry links to an **Archives of Nethys** search so it can be checked against the official reference at https://2e.aonprd.com/.

## Where the rules data comes from

The bundled data in `public/data/` was extracted from the [Foundry VTT pf2e system](https://github.com/foundryvtt/pf2e), which publishes Paizo's rules text under the ORC license. Only Remaster content is included (Player Core, Player Core 2, GM Core, Monster Core, Monster Core 2, NPC Core). To rebuild it from a newer checkout:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/foundryvtt/pf2e.git
(cd pf2e && git sparse-checkout set packs/pf2e)
python3 tools/build_data.py pf2e/packs/pf2e
```

Class proficiency progressions (when saves, Perception, weapons, armor and spellcasting go up) are in `public/js/shared/rules.js`. They were read from each class feature's text in that data. Default spell-slot counts and the GM Core tables (DCs by level, encounter budgets, treasure by level) are entered by hand there too, and are worth spot-checking against Archives of Nethys.

Pathfinder is a trademark of Paizo Inc. This project is not affiliated with Paizo or Archives of Nethys.

## Tests

```bash
npm test
```

Covers the rules math (attributes, partial boosts, HP/AC/attack numbers, class progressions, spell slots, encounter XP, DCs, degrees of success, dice) and the server's game logic (roles, seat limits, fog of war filtering, token movement permissions, handout recipients, secret rolls, hidden enemy stats).

## Layout

```
server.js            HTTP server, JSON persistence, live updates (Server-Sent Events)
server/game.js       game state, permissions, per-role views, actions
server/ai.js         optional Claude-backed GM assistant
public/js/shared/    rules engine and dice (used by both server and browser)
public/js/           GM view, player view, builder, sheet, maps, handouts, tools
public/data/         rules data (generated by tools/build_data.py)
test/                node:test suites
```
