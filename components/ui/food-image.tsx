"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type FoodImageStatus = "verified" | "missing" | "broken" | "placeholder";

type FoodImageKind = "dish" | "ingredient";

const PLACEHOLDER_SRC: Record<FoodImageKind, string> = {
  dish: "/images/placeholder-dish.svg",
  ingredient: "/images/placeholder-ingredient.svg",
};

const FALLBACK_ALT: Record<FoodImageKind, string> = {
  dish: "Dish image unavailable",
  ingredient: "Ingredient image unavailable",
};

function shouldUsePlaceholder(
  src: string | null | undefined,
  status: FoodImageStatus | null | undefined,
): boolean {
  return !src || status !== "verified";
}

export function FoodImage({
  src,
  altText,
  status,
  kind,
  className,
  imageClassName,
  sizes = "10rem",
}: {
  src?: string | null;
  altText?: string | null;
  status?: FoodImageStatus | null;
  kind: FoodImageKind;
  className?: string;
  imageClassName?: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const usePlaceholder = failed || shouldUsePlaceholder(src, status);
  const resolvedSrc = usePlaceholder ? PLACEHOLDER_SRC[kind] : src!;
  const resolvedAlt =
    !usePlaceholder && altText?.trim() ? altText : FALLBACK_ALT[kind];

  return (
    <span
      className={cn(
        "relative block aspect-[4/3] overflow-hidden rounded-md bg-muted",
        className,
      )}
    >
      <Image
        src={resolvedSrc}
        alt={resolvedAlt}
        fill
        sizes={sizes}
        className={cn("object-cover", imageClassName)}
        onError={() => setFailed(true)}
        unoptimized={usePlaceholder}
      />
    </span>
  );
}
