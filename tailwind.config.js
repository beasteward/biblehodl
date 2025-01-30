const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  // in prod look at shadow-cljs output file in dev look at runtime, which will change files that are actually compiled; postcss watch should be a whole lot faster
  content:
    process.env.NODE_ENV == 'production'
      ? ['./target/cljsbuild/public/js/app.js']
      : ['./src/cljs/**/*.cljs', './resources/public/js/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter var', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};

// Run `npm run dev' locally to see live compilation of Tailwind css in browser with hotloading
