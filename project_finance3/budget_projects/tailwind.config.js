/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",                    // ← crucial
    "./js/**/*.{js,html}",             // all your tab files
    "./css/styles.css",                // if you have custom CSS
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
