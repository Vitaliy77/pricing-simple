export const state = {
  month: new Date().toISOString().slice(0,7),
  rolesRate: {}, employees: [], vendors: [],
  equipment: [], materials: []
};
export const $  = (s) => document.querySelector(s);
export const $$ = (s) => Array.from(document.querySelectorAll(s));
export const ymToDate = (ym) => `${ym}-01`;

export function fmtUSD0(x){
  return Number(x||0).toLocaleString('en-US', { minimumFractionDigits:0, maximumFractionDigits:0 });
}
export function fmtUSD2(x){
  return `$${(Number(x||0)).toFixed(2)}`;
}
