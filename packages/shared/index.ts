// `@mmp/shared` — pure, platform-agnostic TypeScript shared between the Next.js
// web app and the Expo mobile app. Nothing here may import `server-only`,
// `next/*`, or perform I/O; the app reaches server-only logic only over HTTP.
//
// Subpath entry points (`@mmp/shared/provider`, `/recommendation`, `/types`,
// `/validation`) are preferred for tree-shaking; this barrel is a convenience
// aggregate.
export * from "./provider";
export * from "./recommendation";
export * from "./types";
export * from "./validation";
