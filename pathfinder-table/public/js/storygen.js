// Procedural adventure seeds for tables without a GM (and GMs short on prep).
// Produces the same plot shape the Plot editor uses.
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const uid = () => Math.random().toString(36).slice(2, 9);

const PLACES = ["Thornwick", "Saltmarrow", "Ashgrove", "Kettle Crossing", "Duskmere", "Harrow's End", "Brightwater", "Fenhollow", "Stoneholm", "Larkspur"];
const REGIONS = ["on the edge of a haunted marsh", "in the shadow of a ruined keep", "at a busy river ford", "high in snowy foothills", "beside an old elven road", "on a fog-bound lake", "near a forgotten mine"];
const PATRONS = [["Mayor", "a worried, overworked mayor"], ["Priest", "a priest of Sarenrae with a guilty conscience"], ["Merchant", "a merchant whose caravan went missing"], ["Innkeeper", "an innkeeper who hears every rumor"], ["Scholar", "a nervous Pathfinder Society scholar"]];
const THREATS = [
  { what: "a cult raising the dead", foe: "cult leader", place: ["Old Cemetery", "dungeon"], beasts: "undead" },
  { what: "goblins stealing children's toys and livestock", foe: "goblin boss", place: ["Bramble Warrens", "cave"], beasts: "goblin" },
  { what: "a hag bargaining for villagers' memories", foe: "hag", place: ["Witchwood", "wilderness"], beasts: "fey" },
  { what: "bandits holding the road to ransom", foe: "bandit captain", place: ["Ruined Toll Fort", "dungeon"], beasts: "humanoid" },
  { what: "something hungry in the flooded mine", foe: "alchemist who woke it", place: ["Drowned Mine", "cave"], beasts: "aberration" },
  { what: "smugglers moving a dangerous relic", foe: "smuggler queen", place: ["Lantern Docks", "town"], beasts: "humanoid" },
];
const NAMES = ["Mirela", "Bram", "Tansy", "Oskar", "Vey", "Halda", "Corwin", "Isolde", "Rook", "Petra", "Ulric", "Sabine"];
const SURN = ["Vosk", "Kettlewick", "Reedwhistle", "Ashdown", "Marrow", "Thorne", "Bellhollow", "Crane"];
const TWISTS = ["the patron is secretly paying the villain", "the villain is trying to stop something worse", "a trusted ally is a spy", "the missing person left willingly", "the treasure is cursed", "the real threat is a rival adventuring party"];

export function randomAdventure(level = 1) {
  const town = pick(PLACES);
  const t = pick(THREATS);
  const [pRole, pDesc] = pick(PATRONS);
  const name = () => `${pick(NAMES)} ${pick(SURN)}`;
  const patron = name(), villain = name(), witness = name();
  const twist = pick(TWISTS);
  return {
    title: `The ${t.place[0]} of ${town}`,
    setting: `${town}, a small town ${pick(REGIONS)}.`,
    partyLevel: level,
    tone: "Adventure with a mystery at its core.",
    synopsis: `${town} is troubled by ${t.what}. Behind it is ${villain}, the ${t.foe}, operating from the ${t.place[0]}. Twist: ${twist}.`,
    hooks: `${patron}, ${pDesc}, offers ${[0, 20, 35, 60, 100][Math.min(4, level)] || level * 25} gp each to deal with the trouble.`,
    acts: [
      { id: uid(), title: "Trouble in town", summary: `Meet ${patron}, question locals like ${witness}, and find the first real clue.` },
      { id: uid(), title: "The trail", summary: `Follow the clues out of ${town}; face ${t.beasts} creatures guarding the way.` },
      { id: uid(), title: `The ${t.place[0]}`, summary: `Confront ${villain} and deal with the twist: ${twist}.` },
    ],
    npcs: [
      { id: uid(), name: patron, role: `${pRole.toLowerCase()}, quest giver`, ancestry: "Human", description: pDesc, secret: twist.startsWith("the patron") ? "Secretly paying the villain." : "", location: `${town} Square` },
      { id: uid(), name: witness, role: "witness", ancestry: pick(["Halfling", "Dwarf", "Gnome", "Human"]), description: "Saw more than they let on and is scared to talk.", secret: `Knows the way to the ${t.place[0]}.`, location: `The ${pick(["Gilded Goose", "Rusty Lantern", "Sleeping Ox"])}` },
      { id: uid(), name: villain, role: `antagonist, ${t.foe}`, ancestry: pick(["Human", "Elf", "Orc", "Goblin"]), description: `Behind ${t.what}.`, secret: twist, location: t.place[0] },
    ],
    locations: [
      { id: uid(), name: `${town} Square`, type: "town", description: `The heart of ${town}; nervous townsfolk and posted notices.` },
      { id: uid(), name: `The ${pick(["Gilded Goose", "Rusty Lantern", "Sleeping Ox"])}`, type: "tavern", description: "A crowded taproom full of rumors." },
      { id: uid(), name: "The Old Road", type: "wilderness", description: `The trail out of ${town}, with signs of ${t.beasts} creatures.` },
      { id: uid(), name: t.place[0], type: t.place[1], description: `Where ${villain} hides.` },
    ],
    secrets: [
      { id: uid(), text: `Tracks and dropped belongings lead toward the ${t.place[0]}.`, revealed: false, location: "The Old Road" },
      { id: uid(), text: `${witness} saw ${villain} meeting someone at night.`, revealed: false, location: "" },
      { id: uid(), text: `The twist: ${twist}.`, revealed: false, location: t.place[0] },
    ],
    factions: "",
    rewards: "Coin from the patron, plus whatever the villain was hoarding.",
    monsterTheme: t.place[1],
  };
}
