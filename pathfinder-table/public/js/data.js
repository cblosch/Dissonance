// Lazy loader for the bundled rules data (built by tools/build_data.py)
const cache = {};

export function load(name) {
  if (!cache[name]) {
    cache[name] = fetch(`data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`Missing data file ${name}.json`);
      return r.json();
    });
  }
  return cache[name];
}

let core = null;
export async function loadCore() {
  if (core) return core;
  const names = ["ancestries", "versatile-heritages", "backgrounds", "classes", "weapons", "armor", "shields"];
  const vals = await Promise.all(names.map(load));
  core = {};
  names.forEach((n, i) => (core[n.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = vals[i]));
  return core;
}
// Synchronous access once loaded
export const coreData = () => core;
