// Dice expressions: "1d20+7", "2d6+4 slashing", "4d6kh3", "1d20+5-2"
// Shared by the server (authoritative rolls) and the browser.

const TERM = /([+-]?)\s*(?:(\d*)d(\d+)(kh\d+|kl\d+)?|(\d+))/gi;

export function parseDice(expr) {
  const terms = [];
  const clean = String(expr || "").replace(/[a-z ]+$/i, (m) => (/(kh|kl)\d*$/i.test(m) ? m : ""));
  let m;
  TERM.lastIndex = 0;
  while ((m = TERM.exec(clean))) {
    const sign = m[1] === "-" ? -1 : 1;
    if (m[3]) {
      const count = Math.min(parseInt(m[2] || "1", 10), 100);
      const sides = Math.min(parseInt(m[3], 10), 1000);
      let keep = null;
      if (m[4]) keep = { mode: m[4].slice(0, 2).toLowerCase(), n: parseInt(m[4].slice(2), 10) };
      terms.push({ type: "dice", sign, count, sides, keep });
    } else if (m[5]) {
      terms.push({ type: "flat", sign, value: parseInt(m[5], 10) });
    }
  }
  return terms;
}

export function rollDice(expr, rng = Math.random) {
  const terms = parseDice(expr);
  if (!terms.length) return null;
  let total = 0;
  const parts = [];
  let natural = null;
  for (const t of terms) {
    if (t.type === "flat") {
      total += t.sign * t.value;
      parts.push(`${t.sign < 0 ? "-" : "+"}${t.value}`);
      continue;
    }
    const rolls = [];
    for (let i = 0; i < t.count; i++) rolls.push(1 + Math.floor(rng() * t.sides));
    let kept = rolls.slice();
    if (t.keep) {
      kept = rolls.slice().sort((a, b) => (t.keep.mode === "kh" ? b - a : a - b)).slice(0, t.keep.n);
    }
    const sum = kept.reduce((a, b) => a + b, 0);
    total += t.sign * sum;
    if (t.sides === 20 && t.count === 1 && natural === null) natural = rolls[0];
    parts.push(`${t.sign < 0 ? "-" : "+"}${t.count}d${t.sides}[${rolls.join(",")}]`);
  }
  return { expr: String(expr), total, natural, detail: parts.join(" ").replace(/^\+/, "") };
}

// PF2e degree of success: beat DC by 10 = crit success, fail by 10 = crit fail,
// natural 20 / natural 1 shift one step.
export const DEGREES = ["Critical Failure", "Failure", "Success", "Critical Success"];

export function degreeOfSuccess(total, dc, natural) {
  let d;
  if (total >= dc + 10) d = 3;
  else if (total >= dc) d = 2;
  else if (total <= dc - 10) d = 0;
  else d = 1;
  if (natural === 20) d = Math.min(3, d + 1);
  if (natural === 1) d = Math.max(0, d - 1);
  return d;
}
