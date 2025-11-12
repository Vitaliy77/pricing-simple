
export const $  = (sel, el=document) => el.querySelector(sel);
export const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
export const h  = (html) => {
  const t = document.createElement('template'); t.innerHTML = html.trim(); 
  return t.content.firstElementChild;
};
