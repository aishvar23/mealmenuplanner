// Expo + NativeWind v4 Babel config. `jsxImportSource: "nativewind"` enables the
// `className` prop on React Native components; `nativewind/babel` is the NativeWind
// preset. See design/10 § 5 (UI: NativeWind).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
