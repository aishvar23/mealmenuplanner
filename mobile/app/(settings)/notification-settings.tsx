import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";

import { isApiError, notificationsApi } from "@/api";
import { Button } from "@/components/Button";
import { ErrorBanner, ErrorState, LoadingState } from "@/components/Feedback";
import { useActiveHousehold } from "@/household/use-household";
import { EMAIL_CATEGORY_OPTIONS } from "@/notifications/categories";

/**
 * Email notification preferences (M2-5, design/09 § 7) for the active household.
 * Email is opt-in; toggles map to the settable categories. Loads current opt-ins,
 * holds a local copy, and saves the full map (`PUT /api/notification-preferences`).
 */
export default function NotificationSettingsScreen() {
  const { household, isLoading, error } = useActiveHousehold();

  if (isLoading) return <LoadingState />;
  if (error || !household) {
    return <ErrorState message="Couldn't load your household." />;
  }
  return <EmailPreferences householdId={household.householdId} />;
}

function EmailPreferences({ householdId }: { householdId: string }) {
  const qc = useQueryClient();
  const [categories, setCategories] = useState<Record<string, boolean> | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["emailPreferences", householdId],
    queryFn: () => notificationsApi.getEmailPreferences(householdId),
  });

  useEffect(() => {
    if (query.data && categories === null) setCategories(query.data.categories);
  }, [query.data, categories]);

  const save = useMutation({
    mutationFn: (next: Record<string, boolean>) =>
      notificationsApi.updateEmailPreferences(householdId, next),
    onSuccess: (data) => {
      setSaveError(null);
      setCategories(data.categories);
      void qc.invalidateQueries({
        queryKey: ["emailPreferences", householdId],
      });
    },
    onError: (e) =>
      setSaveError(isApiError(e) ? e.message : "Couldn't save preferences."),
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !categories) {
    return (
      <ErrorState
        message="Couldn't load your preferences."
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerClassName="gap-4 p-5">
        {saveError ? <ErrorBanner message={saveError} /> : null}
        <Text className="text-base text-gray-500">
          Choose which emails this household sends you. In-app notifications
          always stay on.
        </Text>

        <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {EMAIL_CATEGORY_OPTIONS.map((opt, i) => (
            <View
              key={opt.category}
              className={`flex-row items-center gap-3 px-4 py-3 ${i === EMAIL_CATEGORY_OPTIONS.length - 1 ? "" : "border-b border-gray-100"}`}
            >
              <View className="flex-1">
                <Text className="text-base text-gray-900">{opt.label}</Text>
                <Text className="text-xs text-gray-400">{opt.description}</Text>
              </View>
              <Switch
                value={categories[opt.category] ?? false}
                onValueChange={(v) =>
                  setCategories({ ...categories, [opt.category]: v })
                }
                trackColor={{ true: "#16a34a" }}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="border-t border-gray-100 bg-white px-5 pt-3 pb-5">
        <Button
          label="Save"
          loading={save.isPending}
          onPress={() => save.mutate(categories)}
        />
      </View>
    </View>
  );
}
