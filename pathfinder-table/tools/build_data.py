#!/usr/bin/env python3
"""Build the compact rules data used by Pathfinder Table.

Source: the Foundry VTT pf2e system (https://github.com/foundryvtt/pf2e), whose
Paizo content is published under the ORC license. Only Remaster content
(publication.remaster == true) from the core Remaster books is kept.

Usage:
    git clone --depth 1 --filter=blob:none --sparse https://github.com/foundryvtt/pf2e.git
    (cd pf2e && git sparse-checkout set packs/pf2e)
    python3 tools/build_data.py path/to/pf2e/packs/pf2e
"""
import glob
import json
import os
import re
import sys

CORE_BOOKS = {
    "Pathfinder Player Core",
    "Pathfinder Player Core 2",
    "Pathfinder GM Core",
}
MONSTER_BOOKS = {"Pathfinder Monster Core", "Pathfinder Monster Core 2", "Pathfinder NPC Core"}
PLAYER_CLASSES = {
    "alchemist", "barbarian", "bard", "champion", "cleric", "druid", "fighter",
    "investigator", "monk", "oracle", "ranger", "rogue", "sorcerer",
    "swashbuckler", "witch", "wizard",
}
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "data")


def load_all(pattern):
    out = []
    for f in glob.glob(pattern, recursive=True):
        if os.path.basename(f).startswith("_"):
            continue
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        if isinstance(d, dict) and "system" in d:
            out.append(d)
    return out


def pub(d):
    s = d["system"]
    return s.get("publication") or (s.get("details") or {}).get("publication") or {}


def is_core(d, books=CORE_BOOKS):
    p = pub(d)
    return bool(p.get("remaster")) and p.get("title") in books


SAVE = {"fortitude": "Fortitude", "reflex": "Reflex", "will": "Will"}


def _check(m):
    parts = m.group(1).split("|")
    kind = parts[0].replace("type:", "")
    opts = dict(p.split(":", 1) for p in parts[1:] if ":" in p)
    basic = "basic" in parts[1:] or opts.get("basic") == "true"
    name = SAVE.get(kind, kind.replace("-", " ").title())
    dc = opts.get("dc")
    s = (f"DC {dc} " if dc and dc.isdigit() else "") + ("basic " if basic else "") + name
    return s + (" save" if kind in SAVE else " check")


def _template(m):
    opts = dict(p.split(":", 1) for p in m.group(1).split("|") if ":" in p)
    return f"{opts.get('distance', '?')}-foot {opts.get('type', 'area')}"


def _damage(m):
    inner = m.group(1)
    inner = re.sub(r"\[([a-z,]+)\]", lambda x: " " + x.group(1).replace(",", " "), inner)
    return inner.replace("(", "").replace(")", "")


def clean(html, limit=None):
    if not html:
        return ""
    s = html
    s = re.sub(r"@UUID\[[^\]]*\]\{([^}]*)\}", r"\1", s)
    s = re.sub(r"@UUID\[[^\]]*?\.([^.\]]+)\]", r"\1", s)
    s = re.sub(r"@Check\[([^\]]*)\](?:\{([^}]*)\})?", lambda m: m.group(2) or _check(m), s)
    s = re.sub(r"@Template\[([^\]]*)\](?:\{([^}]*)\})?", lambda m: m.group(2) or _template(m), s)
    # @Damage[...] can contain nested brackets
    s = re.sub(r"@Damage\[((?:[^\[\]]|\[[^\]]*\])*)\](?:\{([^}]*)\})?", lambda m: m.group(2) or _damage(m), s)
    s = re.sub(r"\[\[/b?r(?:oll)? ([^\]]*)\]\](?:\{([^}]*)\})?", lambda m: m.group(2) or m.group(1).split("#")[0].strip(), s)
    s = re.sub(r"\[\[/gmr ([^\]]*)\]\](?:\{([^}]*)\})?", lambda m: m.group(2) or m.group(1), s)
    s = re.sub(r"@Localize\[[^\]]*\]", "", s)
    s = re.sub(r"@\w+\[[^\]]*\]\{([^}]*)\}", r"\1", s)
    s = re.sub(r"@\w+\[([^\]]*)\]", r"\1", s)
    # keep a small whitelist of tags
    s = re.sub(r"<(/?)(p|ul|ol|li|strong|em|hr|br|table|tr|td|th|thead|tbody)(\s[^>]*)?>", r"<\1\2>", s)
    s = re.sub(r"<(?!/?(p|ul|ol|li|strong|em|hr|br|table|tr|td|th|thead|tbody)>)[^>]+>", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    if limit and len(s) > limit:
        s = s[:limit].rsplit(" ", 1)[0] + "…"
    return s


def boosts(obj):
    out = []
    for k in sorted(obj or {}, key=lambda x: int(x)):
        v = obj[k].get("value", [])
        out.append(v)
    return out


def traits(d):
    return d["system"].get("traits", {}).get("value", [])


def rarity(d):
    return d["system"].get("traits", {}).get("rarity", "common")


def actions(s):
    at = (s.get("actionType") or {}).get("value")
    n = (s.get("actions") or {}).get("value")
    if at == "action":
        return str(n or 1)
    if at in ("reaction", "free"):
        return at
    return ""


def write(name, data):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name + ".json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{name}: {len(data)} entries, {os.path.getsize(p)//1024} KB")


def main(root):
    # ---------- ancestries + heritages ----------
    anc = [d for d in load_all(f"{root}/ancestries/*.json") if is_core(d)]
    heritages = [d for d in load_all(f"{root}/heritages/**/*.json") if pub(d).get("remaster")]
    anc_out = []
    for d in sorted(anc, key=lambda x: x["name"]):
        s = d["system"]
        slug = d["name"].lower()
        hs = [h for h in heritages
              if (h["system"].get("ancestry") or {}).get("slug") == slug and pub(h).get("title") in CORE_BOOKS]
        anc_out.append({
            "name": d["name"], "hp": s["hp"], "size": s["size"], "speed": s["speed"],
            "boosts": boosts(s.get("boosts")), "flaws": boosts(s.get("flaws")),
            "languages": s["languages"]["value"], "extraLanguages": s["additionalLanguages"]["value"],
            "vision": s.get("vision", "normal"), "traits": traits(d), "rarity": rarity(d),
            "source": pub(d)["title"], "desc": clean(s["description"]["value"], 900),
            "heritages": [{"name": h["name"], "desc": clean(h["system"]["description"]["value"], 600)}
                          for h in sorted(hs, key=lambda x: x["name"])],
        })
    # versatile heritages from the core books (e.g. Changeling, Nephilim)
    versatile = [h for h in heritages if not h["system"].get("ancestry") and pub(h).get("title") in CORE_BOOKS]
    write("ancestries", anc_out)
    write("versatile-heritages", [{"name": h["name"], "desc": clean(h["system"]["description"]["value"], 600)}
                                  for h in sorted(versatile, key=lambda x: x["name"])])

    # ---------- backgrounds ----------
    bgs = [d for d in load_all(f"{root}/backgrounds/*.json") if is_core(d)]
    feat_names = {}
    for f in load_all(f"{root}/feats/**/*.json"):
        feat_names[f["name"]] = f
    bg_out = []
    for d in sorted(bgs, key=lambda x: x["name"]):
        s = d["system"]
        feat = [i["name"] for i in (s.get("items") or {}).values()]
        bg_out.append({
            "name": d["name"], "boosts": boosts(s.get("boosts")),
            "skills": s.get("trainedSkills", {}).get("value", []),
            "lore": s.get("trainedSkills", {}).get("lore", []),
            "feat": feat[0] if feat else None, "rarity": rarity(d),
            "source": pub(d)["title"], "desc": clean(s["description"]["value"], 500),
        })
    write("backgrounds", bg_out)

    # ---------- classes ----------
    cls = [d for d in load_all(f"{root}/classes/*.json") if d["name"].lower() in PLAYER_CLASSES]
    feats_cf = [d for d in load_all(f"{root}/class-features/**/*.json") if is_core(d)]
    sub_tags = {
        "alchemist": "alchemist-research-field", "barbarian": "barbarian-instinct", "bard": "bard-muse",
        "champion": "champion-cause", "cleric": "cleric-doctrine", "druid": "druid-order",
        "investigator": "investigator-methodology", "oracle": "oracle-mystery",
        "ranger": "ranger-hunters-edge", "rogue": "rogue-racket", "sorcerer": "sorcerer-bloodline",
        "swashbuckler": "swashbuckler-style", "witch": "witch-patron", "wizard": "wizard-arcane-school",
    }
    cls_out = []
    for d in sorted(cls, key=lambda x: x["name"]):
        s = d["system"]
        tag = sub_tags.get(d["name"].lower())
        subs = sorted([{"name": f["name"], "desc": clean(f["system"]["description"]["value"], 700)}
                       for f in feats_cf if tag and tag in f["system"].get("traits", {}).get("otherTags", [])],
                      key=lambda x: x["name"])
        cls_out.append({
            "name": d["name"], "hp": s["hp"], "keyAttribute": s["keyAbility"]["value"],
            "perception": s["perception"], "saves": s["savingThrows"],
            "attacks": {k: v for k, v in s["attacks"].items() if k != "other"},
            "defenses": s["defenses"], "trainedSkills": s["trainedSkills"].get("value", []),
            "additionalSkills": s["trainedSkills"].get("additional", 0),
            "classDC": s.get("classDC", 1), "spellcasting": s.get("spellcasting", 0),
            "ancestryFeatLevels": s["ancestryFeatLevels"]["value"],
            "classFeatLevels": s["classFeatLevels"]["value"],
            "generalFeatLevels": s["generalFeatLevels"]["value"],
            "skillFeatLevels": s["skillFeatLevels"]["value"],
            "skillIncreaseLevels": s["skillIncreaseLevels"]["value"],
            "features": sorted([{"name": i["name"], "level": i["level"]} for i in s["items"].values()],
                               key=lambda x: (x["level"], x["name"])),
            "subclassLabel": (tag or "").split("-", 1)[-1].replace("-", " ").replace("hunters", "hunter's"),
            "subclasses": subs,
            "source": pub(d)["title"], "desc": clean(s["description"]["value"], 1200),
        })
    write("classes", cls_out)

    # ---------- feats ----------
    feats = [d for d in load_all(f"{root}/feats/**/*.json") if is_core(d)]
    feat_out = []
    for d in sorted(feats, key=lambda x: (x["system"]["level"]["value"], x["name"])):
        s = d["system"]
        feat_out.append({
            "name": d["name"], "level": s["level"]["value"], "category": s.get("category"),
            "traits": traits(d), "rarity": rarity(d), "actions": actions(s),
            "prereq": [p.get("value") for p in s.get("prerequisites", {}).get("value", [])],
            "source": pub(d)["title"].replace("Pathfinder ", ""),
            "desc": clean(s["description"]["value"], 1400),
        })
    write("feats", feat_out)

    # ---------- spells ----------
    spells = [d for d in load_all(f"{root}/spells/**/*.json") if is_core(d)]
    sp_out = []
    for d in sorted(spells, key=lambda x: (x["system"]["level"]["value"], x["name"])):
        s = d["system"]
        t = s.get("traits", {})
        defense = s.get("defense") or {}
        save = (defense.get("save") or {}).get("statistic") if isinstance(defense, dict) else None
        sp_out.append({
            "name": d["name"], "rank": s["level"]["value"], "traditions": t.get("traditions", []),
            "traits": t.get("value", []), "rarity": t.get("rarity", "common"),
            "cantrip": "cantrip" in t.get("value", []), "focus": "focus" in t.get("value", []),
            "time": (s.get("time") or {}).get("value", ""), "range": (s.get("range") or {}).get("value", ""),
            "area": (f"{s['area']['value']}-foot {s['area']['type']}" if s.get("area") else ""),
            "target": (s.get("target") or {}).get("value", ""), "save": save,
            "duration": (s.get("duration") or {}).get("value", ""),
            "source": pub(d)["title"].replace("Pathfinder ", ""),
            "desc": clean(s["description"]["value"], 1400),
        })
    write("spells", sp_out)

    # ---------- equipment ----------
    eq = [d for d in load_all(f"{root}/equipment/*.json") if is_core(d)]
    weapons, armor, shields, gear = [], [], [], []
    for d in sorted(eq, key=lambda x: (x["system"].get("level", {}).get("value", 0), x["name"])):
        s = d["system"]
        price = (s.get("price") or {}).get("value", {})
        gp = price.get("gp", 0) + price.get("sp", 0) / 10 + price.get("cp", 0) / 100 + price.get("pp", 0) * 10
        base = {"name": d["name"], "level": s.get("level", {}).get("value", 0), "price": round(gp, 2),
                "bulk": (s.get("bulk") or {}).get("value", 0), "traits": traits(d), "rarity": rarity(d),
                "source": pub(d)["title"].replace("Pathfinder ", "")}
        if d["type"] == "weapon":
            if s.get("runes", {}).get("potency") or s.get("level", {}).get("value", 0) > 0:
                base["desc"] = clean(s["description"]["value"], 500)
                gear.append({**base, "type": "weapon (magic)"})
                continue
            dmg = s["damage"]
            base.update({"category": s["category"], "group": s.get("group"),
                         "damage": f"{dmg.get('dice', 1)}{dmg['die']}", "damageType": dmg["damageType"],
                         "range": s.get("range"), "hands": (s.get("usage") or {}).get("value", ""),
                         "reload": (s.get("reload") or {}).get("value")})
            weapons.append(base)
        elif d["type"] == "armor":
            if s.get("runes", {}).get("potency") or s.get("level", {}).get("value", 0) > 0:
                base["desc"] = clean(s["description"]["value"], 500)
                gear.append({**base, "type": "armor (magic)"})
                continue
            base.update({"category": s["category"], "ac": s["acBonus"], "dexCap": s["dexCap"],
                         "checkPenalty": s["checkPenalty"], "speedPenalty": s["speedPenalty"],
                         "strength": s.get("strength") or 0, "group": s.get("group")})
            if "barding" not in s["category"]:
                armor.append(base)
        elif d["type"] == "shield":
            base.update({"ac": s.get("acBonus", 2), "hardness": s.get("hardness"),
                         "hp": (s.get("hp") or {}).get("max")})
            if s.get("level", {}).get("value", 0) == 0:
                shields.append(base)
            else:
                base["desc"] = clean(s["description"]["value"], 500)
                gear.append({**base, "type": "shield (magic)"})
        elif d["type"] in ("equipment", "consumable", "backpack", "treasure", "ammo"):
            base["type"] = d["type"] if d["type"] != "backpack" else "container"
            if d["type"] == "consumable":
                base["type"] = "consumable"
            base["desc"] = clean(s["description"]["value"], 500)
            gear.append(base)
    write("weapons", weapons)
    write("armor", armor)
    write("shields", shields)
    write("gear", gear)

    # ---------- conditions + actions ----------
    conds = [d for d in load_all(f"{root}/conditions/*.json") if pub(d).get("remaster")]
    write("conditions", [{"name": d["name"], "desc": clean(d["system"]["description"]["value"])}
                         for d in sorted(conds, key=lambda x: x["name"])])
    acts = [d for d in load_all(f"{root}/actions/**/*.json") if is_core(d)]
    write("actions", [{"name": d["name"], "actions": actions(d["system"]), "traits": traits(d),
                       "source": pub(d)["title"].replace("Pathfinder ", ""),
                       "desc": clean(d["system"]["description"]["value"], 1500)}
                      for d in sorted(acts, key=lambda x: x["name"])])

    # ---------- creatures ----------
    mons = []
    for book in ("pathfinder-monster-core", "pathfinder-monster-core-2", "pathfinder-npc-core"):
        mons += [d for d in load_all(f"{root}/{book}/**/*.json") if d.get("type") == "npc" and is_core(d, MONSTER_BOOKS)]
    m_out = []
    for d in sorted(mons, key=lambda x: (x["system"]["details"]["level"]["value"], x["name"])):
        s = d["system"]
        a = s["attributes"]
        strikes, abil, spells_known = [], [], []
        for it in d.get("items", []):
            ss = it["system"]
            if it["type"] == "melee":
                dmg = " plus ".join(f"{r['damage']} {r.get('damageType', '')}".strip()
                                    for r in (ss.get("damageRolls") or {}).values())
                rng = "ranged" if ss.get("range") or any(t.startswith("range") for t in ss["traits"]["value"]) else "melee"
                strikes.append({"name": it["name"], "bonus": ss["bonus"]["value"], "damage": dmg,
                                "traits": ss["traits"]["value"], "type": rng})
            elif it["type"] == "action":
                abil.append({"name": it["name"], "actions": actions(ss),
                             "desc": clean(ss["description"]["value"], 400)})
            elif it["type"] == "spell":
                spells_known.append(it["name"])
        saves = s.get("saves", {})
        skills = {k: v.get("base", v.get("value")) for k, v in (s.get("skills") or {}).items()}
        m_out.append({
            "name": d["name"], "level": s["details"]["level"]["value"], "traits": traits(d),
            "rarity": rarity(d), "size": s["traits"].get("size", {}).get("value", "med"),
            "hp": a["hp"]["max"], "ac": a["ac"]["value"],
            "fort": saves.get("fortitude", {}).get("value"), "ref": saves.get("reflex", {}).get("value"),
            "will": saves.get("will", {}).get("value"),
            "perception": (s.get("perception") or {}).get("mod"),
            "speed": a["speed"]["value"], "otherSpeeds": [f"{o['type']} {o['value']}" for o in a["speed"].get("otherSpeeds", [])],
            "attrs": {k: v["mod"] for k, v in s["abilities"].items()},
            "skills": skills, "immunities": [i["type"] for i in a.get("immunities", [])],
            "weaknesses": [f"{w['type']} {w.get('value', '')}".strip() for w in a.get("weaknesses", [])],
            "resistances": [f"{r['type']} {r.get('value', '')}".strip() for r in a.get("resistances", [])],
            "strikes": strikes, "abilities": abil[:8], "spells": spells_known[:20],
            "source": pub(d)["title"].replace("Pathfinder ", ""),
            "blurb": clean(s["details"].get("publicNotes", ""), 500),
        })
    write("creatures", m_out)

    # ---------- deities (remaster, core) ----------
    deities = [d for d in load_all(f"{root}/deities/**/*.json")
               if pub(d).get("remaster") and d["system"].get("font")]
    dei_out = []
    for d in sorted(deities, key=lambda x: x["name"]):
        s = d["system"]
        dei_out.append({"name": d["name"], "font": s.get("font", []),
                        "sanctification": (s.get("sanctification") or {}).get("what", []),
                        "skill": s.get("skill"), "weapons": s.get("weapons", []),
                        "domains": (s.get("domains") or {}).get("primary", []),
                        "attribute": s.get("attribute", []), "source": pub(d)["title"].replace("Pathfinder ", "")})
    write("deities", dei_out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "pf2e/packs/pf2e")
