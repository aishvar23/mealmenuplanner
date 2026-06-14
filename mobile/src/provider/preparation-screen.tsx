import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatQuantity,
  providerComponentGroupLabel,
  providerVariantSuffix,
} from "@mmp/shared/provider";
import type {
  BatchDto,
  PreparationLine,
  ProviderBatchSummaryDto,
} from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/Feedback";

import { useBatch, useBatchActions, useBatchList } from "./use-preparation";

/**
 * Owner Preparation screen (MP-C-050, the mobile twin of the web Preparation page,
 * spec §13.5 / UC-BATCH-001). Lists the generated batches (one per day's current
 * revision); tapping one opens its persisted roster — the cutoff census, the aggregate
 * cooking quantities, the per-member breakdown, the summary-email status — with the
 * owner actions resend-email + regenerate. Shares no code with the web UI: same
 * `/api/*` routes, same `@mmp/shared/provider` contracts. CSV/PDF share is MP-C-051.
 */
export function PreparationScreen({ providerId }: { providerId: string }) {
  const [selectedMenuDayId, setSelectedMenuDayId] = useState<string | null>(
    null,
  );

  if (selectedMenuDayId) {
    return (
      <BatchDetail
        providerId={providerId}
        menuDayId={selectedMenuDayId}
        onBack={() => setSelectedMenuDayId(null)}
      />
    );
  }

  return <BatchList providerId={providerId} onOpen={setSelectedMenuDayId} />;
}

function BatchList({
  providerId,
  onOpen,
}: {
  providerId: string;
  onOpen: (menuDayId: string) => void;
}) {
  const { data: batches, isLoading, error, refetch } = useBatchList(providerId);

  if (isLoading) return <LoadingState />;
  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
        <View className="p-5">
          <ErrorBanner message="Couldn't load preparation batches." />
          <Button label="Retry" variant="secondary" onPress={() => refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ScrollView contentContainerClassName="gap-4 p-5 pb-10">
        <Text className="text-2xl font-bold text-gray-900">Preparation</Text>
        {(batches ?? []).length === 0 ? (
          <EmptyState
            title="No preparation batches yet"
            hint="After a published menu's cutoff passes, its cooking quantities will appear here."
          />
        ) : (
          (batches ?? []).map((batch) => (
            <BatchRow
              key={batch.batchId}
              batch={batch}
              onPress={() => onOpen(batch.menuDayId)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BatchRow({
  batch,
  onPress,
}: {
  batch: ProviderBatchSummaryDto;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="gap-1 rounded-xl border border-gray-100 bg-white p-4 active:bg-gray-50"
    >
      <View className="flex-row items-center gap-2">
        <Text className="font-medium text-gray-900">{batch.menuDate}</Text>
        <Text className="text-xs text-gray-500">rev {batch.revision}</Text>
        {batch.emailStatus === "sent" ? (
          <Text className="text-xs font-medium text-emerald-700">
            Email sent
          </Text>
        ) : null}
      </View>
      <Text className="text-sm text-gray-500">
        {batch.totals.confirmed} confirmed · {batch.totals.autoAccepted}{" "}
        auto-accepted · {batch.totals.cancelled} cancelled ·{" "}
        {batch.totals.noResponse} no response
      </Text>
    </Pressable>
  );
}

function BatchDetail({
  providerId,
  menuDayId,
  onBack,
}: {
  providerId: string;
  menuDayId: string;
  onBack: () => void;
}) {
  const { data: batch, isLoading, error, refetch } = useBatch(menuDayId);
  const { resendEmail, regenerate } = useBatchActions(providerId, menuDayId);
  const [notice, setNotice] = useState<string | null>(null);

  async function onResend(batchId: string) {
    setNotice(null);
    const result = await resendEmail.mutateAsync(batchId);
    setNotice(
      result.emailStatus === "sent"
        ? `Summary email sent to ${result.recipientCount} recipient${result.recipientCount === 1 ? "" : "s"}.`
        : result.emailStatus === "no_recipient"
          ? "No summary-email recipients are configured."
          : "The summary email couldn't be delivered.",
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ScrollView contentContainerClassName="gap-5 p-5 pb-10">
        <Button label="← Back" variant="secondary" onPress={onBack} />

        {isLoading ? <LoadingState /> : null}
        {error ? (
          <View className="gap-3">
            <ErrorBanner
              message={
                error instanceof Error
                  ? error.message
                  : "Couldn't load this batch."
              }
            />
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => refetch()}
            />
          </View>
        ) : null}

        {batch ? (
          <View className="gap-5">
            <View className="gap-1">
              <Text className="text-2xl font-bold text-gray-900">
                Preparation — {batch.menuDate}
              </Text>
              <Text className="text-sm text-gray-500">
                Revision {batch.revision} ·{" "}
                {batch.status === "current" ? "Current" : "Stale"} · Email:{" "}
                {batch.emailStatus ?? "not sent"}
              </Text>
            </View>

            <Census batch={batch} />

            {(resendEmail.error ?? regenerate.error) ? (
              <ErrorBanner
                message={
                  (resendEmail.error ?? regenerate.error) instanceof Error
                    ? (resendEmail.error ?? regenerate.error)!.message
                    : "Something went wrong."
                }
              />
            ) : null}
            {notice ? (
              <Text className="text-sm text-emerald-700">{notice}</Text>
            ) : null}

            <View className="gap-2">
              <Button
                label="Resend summary email"
                variant="secondary"
                loading={resendEmail.isPending}
                onPress={() => void onResend(batch.batchId)}
              />
              <Button
                label="Regenerate"
                variant="secondary"
                loading={regenerate.isPending}
                onPress={() => regenerate.mutate(batch.batchId)}
              />
            </View>

            <RosterSection
              title="Aggregate roster"
              lines={batch.aggregateLines}
            />

            <View className="gap-3">
              <Text className="text-lg font-semibold text-gray-900">
                Per-member breakdown
              </Text>
              {batch.individualLines.length === 0 ? (
                <Text className="text-sm text-gray-500">
                  No member orders in this batch.
                </Text>
              ) : (
                batch.individualLines.map((member) => (
                  <View key={member.memberUserId} className="gap-2">
                    <Text className="font-medium text-gray-900">
                      {member.displayName ?? "Member"}
                    </Text>
                    <RosterLines lines={member.lines} />
                  </View>
                ))
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Census({ batch }: { batch: BatchDto }) {
  const cells: { label: string; value: number }[] = [
    { label: "Confirmed", value: batch.totals.confirmed },
    { label: "Auto-accepted", value: batch.totals.autoAccepted },
    { label: "Cancelled", value: batch.totals.cancelled },
    { label: "No response", value: batch.totals.noResponse },
  ];
  return (
    <View className="flex-row flex-wrap gap-3 rounded-xl border border-gray-100 bg-white p-4">
      {cells.map((c) => (
        <View key={c.label} className="w-[45%] gap-0.5">
          <Text className="text-xs text-gray-500">{c.label}</Text>
          <Text className="text-xl font-semibold text-gray-900">{c.value}</Text>
        </View>
      ))}
    </View>
  );
}

function RosterSection({
  title,
  lines,
}: {
  title: string;
  lines: PreparationLine[];
}) {
  return (
    <View className="gap-2">
      <Text className="text-lg font-semibold text-gray-900">{title}</Text>
      <RosterLines lines={lines} />
    </View>
  );
}

function RosterLines({ lines }: { lines: PreparationLine[] }) {
  if (lines.length === 0) {
    return (
      <Text className="text-sm text-gray-500">No items in this batch.</Text>
    );
  }
  return (
    <View className="gap-2 rounded-xl border border-gray-100 bg-white p-4">
      {lines.map((line, i) => (
        <View
          key={`${line.catalogItemId}-${i}`}
          className="flex-row items-start justify-between gap-3"
        >
          <View className="min-w-0 flex-1">
            <Text className="font-medium text-gray-900">
              {line.itemName}
              {providerVariantSuffix(line.spiceLevel, line.saltLevel)}
            </Text>
            <Text className="text-xs text-gray-500">
              {providerComponentGroupLabel(line.componentGroup)}
            </Text>
          </View>
          <Text className="text-sm text-gray-900">
            {formatQuantity(line.totalQuantity)} {line.canonicalUnit}
          </Text>
        </View>
      ))}
    </View>
  );
}
