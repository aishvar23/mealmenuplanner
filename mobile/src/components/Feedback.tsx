import { type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "./Button";

/**
 * Shared loading / empty / error states for the data screens (design/10 § 4 —
 * "error envelopes surface as friendly messages"). One place so Today, Week, and
 * Grocery all feel consistent.
 */

/** Full-screen centered spinner while a query is loading. */
export function LoadingState({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#16a34a" />
      {label ? (
        <Text className="mt-3 text-base text-gray-500">{label}</Text>
      ) : null}
    </View>
  );
}

/** A friendly error with an optional retry. `message` comes from the API envelope. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white px-8">
      <Text className="text-center text-base text-gray-700">{message}</Text>
      {onRetry ? (
        <View className="w-40">
          <Button label="Try again" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

/** An empty placeholder with a title, hint, and an optional primary action. */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-white px-8">
      <Text className="text-center text-lg font-semibold text-gray-900">
        {title}
      </Text>
      {hint ? (
        <Text className="text-center text-base text-gray-500">{hint}</Text>
      ) : null}
      {action ? <View className="mt-2 w-56">{action}</View> : null}
    </View>
  );
}

/** An inline (non-full-screen) error banner for mutation failures. */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <View className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <Text className="text-sm text-red-700">{message}</Text>
    </View>
  );
}
