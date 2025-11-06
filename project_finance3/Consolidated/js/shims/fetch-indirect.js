// js/shims/fetch-indirect.js
// Load this BEFORE your app code. It rewrites the broken REST URL on the fly.
(function () {
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const urlStr = typeof input === 'string' ? input : input.url;
      if (urlStr && urlStr.includes('/rest/v1/indirect_lines')) {
        const u = new URL(urlStr, location.origin);
        const ymAll = u.searchParams.getAll('ym');  // e.g. ["gte.2025-01-01","lte.2025-12-31"]
        if (ymAll.length >= 2) {
          const gte = ymAll.find(v => v.startsWith('gte.'));
          const lte = ymAll.find(v => v.startsWith('lte.'));
          if (gte && lte) {
            const from = gte.slice(4); // after "gte."
            const to   = lte.slice(4); // after "lte."
            // Replace duplicate ym params with a single AND range
            u.searchParams.delete('ym');
            u.searchParams.set('and', `(ym.gte.${from},ym.lle.${to})`.replace('.lle.', '.lte.'));
            const newUrl = u.toString();
            console.warn('[shim] Rewrote indirect_lines URL:', newUrl);
            if (typeof input === 'string') input = newUrl;
            else input = new Request(newUrl, input);
          }
        }
      }
    } catch (_) { /* ignore and fall back to original fetch */ }
    return origFetch.call(this, input, init);
  };
})();
