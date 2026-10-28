# Dissonance

A first-person 3D game where you play as a music note that's come to life.

Some notes have snuck into the song that don't belong in the key. Your job is to find the off-key notes and shoot your own pitch at them until they're back in tune. Clear them all and you move on to the next level.

## How it works

- **You're standing on the staff.** The level is nine glass floors stacked on top of each other, one for each line and space of the treble staff (E4 at the bottom up to F5 at the top). Whatever floor you're on is the note you play.
- **You can only hit notes on your own floor.** Your shots can't go through the floor above you or the one below.
- **Red notes are off-key.** Each one is labelled with its note (like C♯ in C major, or F♮ in G major), and touching one drains your harmony. Beat one and it slides back to the right note and floats away.
- **Gold notes belong in the key.** Leave them alone. Shooting one costs you harmony.
- From level 3 on, off-key notes can hop between floors to chase you.

### Sharps, flats and naturals

- **Sharp ♯ (E):** moves you up a step, and for 6 seconds your shots fly faster, hit twice as hard and go straight through notes.
- **Flat ♭ (Q):** drops you down a step and sends out a shockwave where you land. It damages, knocks back and slows any off-key notes nearby.
- On the top or bottom line you still get the effect, you just don't move.
- **Beaten notes drop what they were wearing.** A C♯ drops a sharp, a B♭ drops a flat, and an off-key natural drops a **natural ♮**, which heals you.
- **You can't get stuck.** If the only off-key notes left are on other floors and you have nothing to get there with, a sharp or flat shows up in front of you after a few seconds.

### Enemy types

Each kind of note behaves according to its length. Most of them move in time with the music.

| Note | Hits | Behaviour |
| --- | --- | --- |
| Whole | 6 | Slow and tough. Standing inside the ring around it hurts. |
| Half | 4 | Hangs back and fires sour rings at you every other bar. |
| Quarter | 3 | Lunges toward you on every beat. |
| Eighth | 2 | Zigzags in twice a beat. |
| Sixteenth | 1 | Tiny and fast, and they come in pairs. |

There are five levels: C major, G major, F major, D major and E♭ major. New note types show up as you go, and the screen before each level lists what you're up against. The HUD shows the notes in the current key, and the little staff in the corner shows which floors still have off-key notes on them.

The background music is generated as you play and stays in the level's key, which is why the off-key notes sound so wrong against it. It speeds up a little each level.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move |
| Mouse | Look around |
| Left click | Shoot |
| E / scroll up | Use a sharp (up a step + sharp shots) |
| Q / scroll down | Use a flat (down a step + shockwave) |
| Shift | Sprint |
| R | Restart the level |
| M | Mute |
| Esc | Pause (restart or quit from here too) |

## Running it

There's no build step. The page just needs to be served over HTTP, because browsers block the game's code files if you open `index.html` straight from disk. From the project folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

`npx serve` works too. Three.js is included in `vendor/`, so it runs offline. It also works on GitHub Pages.

## Code layout

- `index.html`, `style.css`: the page, HUD and menus
- `src/main.js`: the 3D scene, player, enemies, pickups and game loop
- `src/music.js`: the staff, the keys, each level's enemy mix, and which notes count as off-key
- `src/notes.js`: the note models and the stats for each enemy type
- `src/audio.js`: all the sound, made with the Web Audio API, including the soundtrack
