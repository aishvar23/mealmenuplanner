import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Convenience aliases for the acceptance-test route names (BUG-002 / AUTH-004).
   * The real shell routes are `/today` and `/plan`; the test suite (and some
   * external links) use `/dashboard` and `/meal-plan`. These config redirects run
   * BEFORE the edge proxy, so an alias resolves to the real route and the proxy
   * then bounces an unauthenticated visitor to `/sign-in?next=…` exactly as it
   * does for the canonical path — no private data renders first.
   */
  async redirects() {
    return [
      { source: "/dashboard", destination: "/today", permanent: false },
      { source: "/dashboard/:path*", destination: "/today", permanent: false },
      { source: "/meal-plan", destination: "/plan", permanent: false },
      { source: "/meal-plan/:path*", destination: "/plan", permanent: false },
    ];
  },
};

export default nextConfig;
