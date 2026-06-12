// Provider onboarding form helpers — shared, pure, platform-agnostic so the web
// wizard (`ProviderOnboardingWizard`) and the mobile controller
// (`useProviderOnboarding`) use one definition and can't drift (web↔mobile parity
// is a hard rule). No I/O, no `server-only`, no `next/*`.

/**
 * Best-effort IANA timezone of the current runtime, e.g. `Asia/Kolkata`. Falls
 * back to `UTC` when `Intl` is unavailable or throws (older/odd runtimes).
 */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Map a blank/whitespace-only string to `null`, else the trimmed value. */
export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
