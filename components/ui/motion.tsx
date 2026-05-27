"use client";

import {
  domAnimation,
  LazyMotion,
  m,
  useReducedMotion,
  type Variants,
} from "motion/react";
import type { ReactNode } from "react";

/**
 * Motion helpers (RSC-safe). Motion is client-only, so all of it lives here
 * behind `"use client"`; server components import these wrappers and pass
 * server-rendered children through. We load only the lightweight
 * `domAnimation` feature set via `LazyMotion` (~4.6KB).
 *
 * Hydration note: `initial`/`animate` (which become SSR'd inline styles) are
 * kept DETERMINISTIC — they must not branch on `useReducedMotion()`, whose
 * value differs between server and client and would cause a hydration mismatch.
 * Reduced motion is honoured by collapsing the transition *duration* to 0
 * (transition isn't part of the SSR markup), so the element snaps to its final
 * state with no animation.
 */

// A calm, premium ease (cubic-bezier "out-expo"-ish).
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Fades content in (with an optional upward drift). Pass `y={0}` for an
 * opacity-only fade.
 */
export function FadeIn({
  children,
  className,
  delay = 0,
  y = 8,
  duration = 0.4,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const animate = y ? { opacity: 1, y: 0 } : { opacity: 1 };
  const initial = y ? { opacity: 0, y } : { opacity: 0 };

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className={className}
        initial={initial}
        animate={animate}
        transition={{
          duration: reduce ? 0 : duration,
          delay: reduce ? 0 : delay,
          ease: EASE,
        }}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const staggerParentReduced: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0 } },
};

/**
 * Reveals its {@link StaggerItem} children one after another. Apply the layout
 * classes (e.g. the grid) to this wrapper.
 */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className={className}
        variants={reduce ? staggerParentReduced : staggerParent}
        initial="hidden"
        animate="show"
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}

/** One item in a {@link Stagger}. Must be rendered inside a `Stagger`. */
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  // `hidden` is deterministic (no reduce branch) so SSR markup matches; only the
  // show-transition duration collapses to 0 for reduced motion.
  const variants: Variants = {
    hidden: { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0 : 0.4, ease: EASE },
    },
  };
  return (
    <m.div className={className} variants={variants}>
      {children}
    </m.div>
  );
}
