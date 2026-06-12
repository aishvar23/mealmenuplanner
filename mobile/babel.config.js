// Expo + NativeWind v4 Babel config. `jsxImportSource: "nativewind"` enables the
// `className` prop on React Native components; `nativewind/babel` is the NativeWind
// preset. See design/10 § 5 (UI: NativeWind).
//
// Under Jest (`NODE_ENV=test`, MP-C-000) we adjust two things; the cache key
// includes NODE_ENV so the test and dev/build configs don't collide:
//
//  1. Drop the NativeWind transform — its injected `react-native-css-interop`
//     require is not hoisted in this workspace install and so fails to resolve
//     from the RN jest-preset's mock files. Unit/hook tests don't assert styles
//     (RN ignores the unrecognised `className` prop), so plain `babel-preset-expo`
//     is correct for tests.
//  2. Strip TypeScript on `.ts`/`.tsx` files (with `allowDeclareFields`) *before*
//     `babel-preset-expo`'s RN/flow transform runs. Override presets apply first,
//     so our shared cross-package TS — which uses `declare` class fields (e.g.
//     `lib/errors/domain-errors.ts`) — is reduced to plain JS before the flow
//     strip plugin, which would otherwise reject `declare`, ever sees it. Scoped
//     to `.tsx?$` so RN core's Flow `.js` sources are untouched.
module.exports = function (api) {
  const isTest = api.env("test");
  api.cache.using(() => process.env.NODE_ENV);
  return {
    presets: [
      ["babel-preset-expo", isTest ? {} : { jsxImportSource: "nativewind" }],
      ...(isTest ? [] : ["nativewind/babel"]),
    ],
    overrides: isTest
      ? [
          {
            test: /\.tsx?$/,
            presets: [
              ["@babel/preset-typescript", { allowDeclareFields: true }],
            ],
          },
        ]
      : [],
  };
};
