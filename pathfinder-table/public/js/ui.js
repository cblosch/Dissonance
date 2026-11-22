// Small DOM helpers

// Let append() skip null/false/undefined and flatten arrays, so conditional
// children (cond ? el : null) can be passed straight in.
for (const method of ["append", "prepend", "replaceChildren"]) {
  const orig = Element.prototype[method];
  Element.prototype[method] = function (...kids) {
    return orig.apply(this, kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
  };
}
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const cap = (s) => String(s || "").replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());
export const signed = (n) => (n === null || n === undefined ? "—" : n >= 0 ? `+${n}` : `${n}`);
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

export function toast(msg, kind = "info") {
  let box = document.getElementById("toasts");
  if (!box) { box = h("div", { id: "toasts" }); document.body.append(box); }
  const t = h("div", { class: `toast ${kind}` }, msg);
  box.append(t);
  setTimeout(() => t.classList.add("out"), 3500);
  setTimeout(() => t.remove(), 4200);
}

export function modal(title, body, { wide = false, onClose } = {}) {
  const close = () => { back.remove(); onClose && onClose(); };
  const back = h("div", { class: "modal-back", onclick: (e) => e.target === back && close() },
    h("div", { class: `modal ${wide ? "wide" : ""}` },
      h("div", { class: "modal-head" }, h("h3", {}, title), h("button", { class: "icon", onclick: close, title: "Close" }, "✕")),
      h("div", { class: "modal-body" }, body)));
  document.body.append(back);
  return { close, el: back };
}

// ---------------------------------------------------------------
// Phone vs desktop. Layout switches at 760px; listeners re-render on change.
// ---------------------------------------------------------------
export const mobileQuery = window.matchMedia("(max-width: 760px)");
export const isMobile = () => mobileQuery.matches;
export function onLayoutChange(fn) { mobileQuery.addEventListener("change", fn); }

// Bottom sheet with a list of actions (phone menus, "More" tabs)
export function actionSheet(title, items) {
  const close = () => back.remove();
  const back = h("div", { class: "sheet-back", onclick: (e) => e.target === back && close() },
    h("div", { class: "action-sheet" },
      title ? h("div", { class: "as-title" }, title) : null,
      items.filter(Boolean).map((it) => it.href
        ? h("a", { class: `as-item ${it.active ? "active" : ""}`, href: it.href, download: it.download || null, onclick: close }, it.icon ? h("span", { class: "as-icon" }, it.icon) : null, it.label)
        : h("button", { class: `as-item ${it.active ? "active" : ""}`, onclick: () => { close(); it.onClick(); } },
          it.icon ? h("span", { class: "as-icon" }, it.icon) : null, it.label, it.badge ? h("span", { class: "badge" }, it.badge) : null)),
      h("button", { class: "as-item cancel", onclick: close }, "Close")));
  document.body.append(back);
  return { close };
}

// Tabs. On desktop: a top bar with every tab. On phones: a fixed bottom bar
// with the `primary` tabs plus "More", which opens the rest in a sheet.
// def: { id, label, icon, render, primary, mobileOnly, badge: () => n }
export function tabs(defs, { onChange, initial, persistKey } = {}) {
  let current = initial || defs[0].id;
  try { if (persistKey && localStorage.getItem(persistKey)) current = localStorage.getItem(persistKey); } catch {}
  const visible = () => defs.filter((d) => isMobile() || !d.mobileOnly);
  const fix = () => { if (!visible().find((d) => d.id === current)) current = visible()[0].id; };
  fix();
  const bar = h("nav", { class: "tabs" });
  const body = h("div", { class: "tab-body" });
  const badgeOf = (d) => (typeof d.badge === "function" ? d.badge() : d.badge);
  const drawBar = () => {
    clear(bar);
    bar.classList.toggle("bottom-nav", isMobile());
    if (!isMobile()) {
      for (const d of visible()) bar.append(h("button", { class: d.id === current ? "active" : "", onclick: () => select(d.id) }, d.label, badgeOf(d) ? h("span", { class: "badge" }, badgeOf(d)) : null));
      return;
    }
    const prim = visible().filter((d) => d.primary);
    const rest = visible().filter((d) => !d.primary);
    const navBtn = (d) => h("button", { class: d.id === current ? "active" : "", onclick: () => select(d.id) },
      h("span", { class: "nav-icon" }, d.icon || "•", badgeOf(d) ? h("span", { class: "badge" }, badgeOf(d)) : null), h("span", { class: "nav-label" }, d.short || d.label));
    for (const d of prim) bar.append(navBtn(d));
    if (rest.length) {
      const inRest = rest.find((d) => d.id === current);
      const restBadge = rest.reduce((n, d) => n + (+badgeOf(d) || 0), 0);
      bar.append(h("button", { class: inRest ? "active" : "", onclick: () => actionSheet("More", rest.map((d) => ({ icon: d.icon, label: d.label, active: d.id === current, badge: badgeOf(d), onClick: () => select(d.id) }))) },
        h("span", { class: "nav-icon" }, inRest ? inRest.icon || "•" : "☰", restBadge ? h("span", { class: "badge" }, restBadge) : null),
        h("span", { class: "nav-label" }, inRest ? inRest.short || inRest.label : "More")));
    }
  };
  const render = () => {
    fix();
    drawBar();
    clear(body);
    body.append(defs.find((d) => d.id === current).render());
  };
  const select = (id) => {
    current = id;
    try { persistKey && localStorage.setItem(persistKey, id); } catch {}
    render();
    window.scrollTo(0, 0);
    onChange && onChange(id);
  };
  render();
  onLayoutChange(render);
  return { el: h("div", { class: "tabset" }, bar, body), select, refresh: render, updateBar: drawBar, get current() { return current; } };
}

export function field(label, input, hint) {
  return h("label", { class: "field" }, h("span", { class: "lbl" }, label), input, hint ? h("small", { class: "hint" }, hint) : null);
}

export function select(options, value, onChange, attrs = {}) {
  const el = h("select", { ...attrs, onchange: (e) => onChange(e.target.value) },
    options.map((o) => {
      const v = typeof o === "object" ? o.value : o;
      const l = typeof o === "object" ? o.label : o;
      return h("option", { value: v, selected: String(v) === String(value) ? "selected" : null }, l);
    }));
  return el;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Render the limited HTML produced by the data build (already sanitized to a tag whitelist)
export function richText(html) {
  const div = h("div", { class: "rich" });
  div.innerHTML = String(html || "").replace(/<(?!\/?(p|ul|ol|li|strong|em|hr|br|table|tr|td|th|thead|tbody)>)[^>]*>/g, "");
  return div;
}

export function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast("Copied to clipboard"), () => prompt("Copy this:", text));
}
