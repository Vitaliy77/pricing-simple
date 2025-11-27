// js/tabs/revenueBudget.js
export const template = /*html*/ `
  <article>
    <h3>Revenue Budget</h3>
    <p>
      Here we will build revenue by lowest-level project, using:
      labor revenue (hours × billing rate), CPFF (cost × (1+margin)),
      and direct entry for fixed/software/unit/other revenue.
    </p>
  </article>
`;

export const revenueBudgetTab = {
  template,
  init() {
    // TODO: implement revenue entry grid (by project, type, month)
  },
};
