# Dissonance

A first-person 3D game where you play as a sentient music note.

Wrong notes have crept into the measure. Each level is set in a key, and any note that doesn't belong to that key's scale is **dissonant**. Fire your own pitch at the dissonant notes to resolve them back into the scale. Clear every dissonant note to finish the measure.

## How it plays

- **The staff is the level.** The measure is stacked into nine glass floors, one for each line and space of the treble staff from E4 to F5. Each floor sounds its own pitch, and you sound the pitch of whichever floor you're standing on.
- **You can only hit notes on your own floor.** Your shots can't pass through the staff lines above or below you.
- **Sharps ♯ and flats ♭ are power-ups.** A sharp shifts you up one step on the staff and a flat shifts you down one. Pick them up as you find them. They respawn over time.
- **Red notes are dissonant enemies.** They're labelled with their wrong accidental (for example C♯ in C major, or F♮ in G major), they jitter and hum out of tune, and they drain your harmony on contact. Hit one three times to resolve it. It bends to its in-key pitch and floats away.
- **Gold notes belong in the key.** Leave them alone. Hitting one costs harmony.
- From the third measure on, dissonant notes can slide along the staff toward your floor.

The five measures are C major, G major, F major, D major and E♭ major. The HUD shows the current scale, and the staff map in the corner shows which floors still have dissonant notes.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move |
| Mouse | Look |
| Left click | Fire your pitch |
| E / scroll up | Use a sharp (move up a step) |
| Q / scroll down | Use a flat (move down a step) |
| Shift | Sprint |
| M | Mute |
| Esc | Pause |

## Running it

It's a static site with no build step. Three.js is vendored in `vendor/`, so it works offline. ES modules need to be served over HTTP, so start any static server from the repo root:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

It also works as-is on GitHub Pages.

## Code layout

- `index.html`, `style.css`: page, HUD and menus
- `src/main.js`: scene, player, enemies, pickups and game loop
- `src/music.js`: staff, key signatures, and which notes are dissonant in each key
- `src/audio.js`: synthesized sound (Web Audio), including the tonic drone and positional hums for dissonant notes
