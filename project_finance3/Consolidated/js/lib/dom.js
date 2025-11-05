export const $  = (sel) => document.querySelector(sel);
export const $$ = (sel) => Array.from(document.querySelectorAll(sel));
export const monthToDate = (ym) => `${ym}-01`;
export const fmtUSD0 = (x=0) => Number(x||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
export const formatMoney = (x=0) => `$${Number(x||0).toFixed(2)}`;
