/**
 * The looping product demo recorded from the real app (scripts/record-demo.mjs):
 * household setup through to today's recommended meal. Rendered on the marketing
 * landing page and the invite landing page, so the asset paths + poster + a11y
 * label live in exactly one place. Muted + autoplay + loop means no controls and
 * no client JS — safe to render from a server component.
 */

const DEMO_POSTER = "/demo/onboarding-demo-poster.jpg";
const DEMO_LABEL =
  "Product demo: set up your household, then see today's recommended meal.";

export function DemoVideo({
  className,
  ariaLabel = DEMO_LABEL,
}: {
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <video
      className={className}
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      poster={DEMO_POSTER}
      aria-label={ariaLabel}
    >
      <source src="/demo/onboarding-demo.webm" type="video/webm" />
      <source src="/demo/onboarding-demo.mp4" type="video/mp4" />
    </video>
  );
}
