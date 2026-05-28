import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Image optimization (BUG-016 / PERF-001). Dish photos and the landing hero are
   * served through `next/image` (the shared `<FoodImage>`), so enabling modern
   * formats + a sensible size ladder lets Next transcode to AVIF/WebP and emit a
   * right-sized variant per breakpoint instead of shipping multi-MB PNGs. This is
   * the highest-leverage perf fix; re-encoding the source assets is a further win.
   */
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Cache optimized variants for a week — the dish catalog rarely changes.
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
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
