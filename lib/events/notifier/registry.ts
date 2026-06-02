import "server-only";

import { EmailNotifier } from "./email";
import { ExpoPushNotifier } from "./expo-push";
import { createNoopNotifier } from "./noop";
import type { Channel, Notifier } from "./port";

/**
 * Maps `Channel → Notifier` (design/09 § 1). The router (§5) decides WHICH
 * channels fire; the registry decides HOW each one delivers. Adding push later is
 * registering one adapter and flipping it on in routing — no domain code changes.
 */
export class NotifierRegistry {
  private readonly adapters = new Map<Channel, Notifier>();

  register(notifier: Notifier): this {
    this.adapters.set(notifier.channel, notifier);
    return this;
  }

  get(channel: Channel): Notifier | undefined {
    return this.adapters.get(channel);
  }

  has(channel: Channel): boolean {
    return this.adapters.has(channel);
  }

  get channels(): Channel[] {
    return [...this.adapters.keys()];
  }
}

/**
 * The registry: a real {@link EmailNotifier} for invites/events, a real
 * {@link ExpoPushNotifier} for native push (both best-effort no-ops until their
 * transport env is set), and no-op adapters for in-app (written by the fan-out
 * RPC), WhatsApp, and SMS.
 */
export function buildDefaultRegistry(): NotifierRegistry {
  return new NotifierRegistry()
    .register(createNoopNotifier("inApp"))
    .register(new EmailNotifier())
    .register(new ExpoPushNotifier())
    .register(createNoopNotifier("whatsapp"))
    .register(createNoopNotifier("sms"));
}

let cached: NotifierRegistry | null = null;

/** The process-wide default registry (built once, lazily). */
export function getNotifierRegistry(): NotifierRegistry {
  if (!cached) cached = buildDefaultRegistry();
  return cached;
}
