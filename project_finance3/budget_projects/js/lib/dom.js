// js/lib/dom.js

// Lightweight DOM helper used across tabs

// Query helper: $("selector", root?) -> element or null
export function $(selector, root = document) {
  if (!root) return null;
  return root.querySelector(selector);
}

// Create element helper: h("tag", props, ...children)
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);

  // Apply props
  for (const [key, value] of Object.entries(props || {})) {
    if (key === "class" || key === "className") {
      el.className = value;
    } else if (key === "style" && typeof value === "object") {
      Object.assign(el.style, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null) {
      el.setAttribute(key, value);
    }
  }

  // Append children
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      child.forEach((c) => c && el.appendChild(
        c instanceof Node ? c : document.createTextNode(String(c))
      ));
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }

  return el;
}
