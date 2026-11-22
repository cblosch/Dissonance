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

export function tabs(defs, { onChange, initial, persistKey } = {}) {
  let current = initial || defs[0].id;
  try { if (persistKey && localStorage.getItem(persistKey)) current = localStorage.getItem(persistKey); } catch {}
  if (!defs.find((d) => d.id === current)) current = defs[0].id;
  const bar = h("nav", { class: "tabs" });
  const body = h("div", { class: "tab-body" });
  const render = () => {
    clear(bar);
    for (const d of defs) {
      bar.append(h("button", { class: d.id === current ? "active" : "", onclick: () => select(d.id) }, d.label, d.badge ? h("span", { class: "badge" }, d.badge) : null));
    }
    clear(body);
    const def = defs.find((d) => d.id === current);
    body.append(def.render());
  };
  const select = (id) => {
    current = id;
    try { persistKey && localStorage.setItem(persistKey, id); } catch {}
    render();
    onChange && onChange(id);
  };
  render();
  return { el: h("div", { class: "tabset" }, bar, body), select, refresh: render, get current() { return current; } };
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
