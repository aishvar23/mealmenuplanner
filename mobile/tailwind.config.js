/** @type {import('tailwindcss').Config} */
// NativeWind v4 Tailwind config. `content` globs the app + shared UI; the
// NativeWind preset maps Tailwind tokens to React Native styles.
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Brand accent — kept in sync with the web app's primary green.
        brand: {
          DEFAULT: "#16a34a",
          fg: "#ffffff",
        },
      },
    },
  },
  plugins: [],
};
