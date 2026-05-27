import type { ReactNode } from "react";

/**
 * A `template` (unlike a `layout`) remounts on every navigation within the
 * (app) group, so the entrance animation re-runs on each route change, giving a
 * gentle fade-in. Uses a CSS-only animation (`tw-animate-css`) rather than JS
 * motion so there's no SSR inline-style/hydration mismatch and no blank-until-JS
 * flash; `prefers-reduced-motion` collapses the duration via the global rule in
 * globals.css.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="animate-in duration-300 ease-out fade-in">{children}</div>
  );
}
