import { router } from "expo-router";
import type { ReactElement } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { ErrorBanner, ErrorState, LoadingState } from "@/components/Feedback";
import { OnboardingHeader } from "@/components/OnboardingHeader";
import { formatSaveStatus } from "@/onboarding/save-status";
import { STEPS } from "@/onboarding/steps";
import {
  AllergiesHealthStep,
  BudgetStep,
  FoodPreferencesStep,
  HouseholdBasicsStep,
  MealScheduleStep,
  ReviewStep,
  type StepProps,
} from "@/onboarding/step-views";
import {
  useOnboarding,
  type OnboardingController,
} from "@/onboarding/use-onboarding";

/**
 * Onboarding wizard (M2-1, design/06). A resumable, autosaving multi-step setup
 * that promotes a draft into the user's first household. Reached when a signed-in
 * user has no household; on finish it routes to Today.
 */
export default function OnboardingScreen() {
  const c = useOnboarding();

  if (c.phase === "loading")
    return <LoadingState label="Loading your setup…" />;
  if (c.phase === "error") {
    return (
      <ErrorState
        message={c.loadError ?? "Couldn't load your setup."}
        onRetry={c.retryLoad}
      />
    );
  }
  if (c.phase === "resume") return <ResumePrompt controller={c} />;

  return <Wizard controller={c} />;
}

function ResumePrompt({ controller: c }: { controller: OnboardingController }) {
  const status = c.resumeInfo
    ? formatSaveStatus({
        status: "saved",
        lastSavedAt: c.resumeInfo.lastSavedAt,
        error: null,
      })
    : null;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center gap-4 px-8">
        <Text className="text-2xl font-bold text-gray-900">
          Continue setting up your household?
        </Text>
        <Text className="text-base text-gray-500">
          You&apos;re {c.resumeInfo?.completionPercentage ?? 0}% done.
          {status ? ` ${status.text}` : ""}
        </Text>
        <View className="mt-2 gap-3">
          <Button label="Resume" onPress={c.resume} />
          <Button
            label="Start over"
            variant="secondary"
            onPress={c.startOver}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const STEP_BODIES: Record<string, (props: StepProps) => ReactElement> = {
  household_basics: HouseholdBasicsStep,
  food_preferences: FoodPreferencesStep,
  meal_schedule: MealScheduleStep,
  allergies_health: AllergiesHealthStep,
  budget: BudgetStep,
  review: ReviewStep,
};

function Wizard({ controller: c }: { controller: OnboardingController }) {
  const meta = STEPS[c.stepIndex]!;
  const isReview = c.stepId === "review";
  const isFirst = c.stepIndex === 0;
  const StepBody = STEP_BODIES[c.stepId]!;

  async function onFinish() {
    try {
      await c.finish();
      router.replace("/(tabs)/today");
    } catch {
      // `finishError` is set by the hook; the banner surfaces it.
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <OnboardingHeader
          title={meta.title}
          subtitle={meta.subtitle}
          stepIndex={c.stepIndex}
          totalSteps={c.totalSteps}
          completionPercentage={c.completionPercentage}
          save={c.save}
          onRetrySave={c.retrySave}
        />

        <ScrollView
          contentContainerClassName="gap-4 p-5 pb-8"
          keyboardShouldPersistTaps="handled"
        >
          <StepBody data={c.draftData} update={c.updateDraft} />

          {isReview && c.finishError ? (
            <ErrorBanner message={c.finishError} />
          ) : null}

          {isReview && !c.canFinish ? (
            <View className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <Text className="text-sm text-amber-800">
                Add a few more details before finishing: go back and fill in
                each step marked required.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View className="flex-row gap-3 border-t border-gray-100 bg-white px-5 pt-3 pb-5">
          {!isFirst ? (
            <View className="flex-1">
              <Button label="Back" variant="secondary" onPress={c.back} />
            </View>
          ) : null}
          <View className="flex-1">
            {isReview ? (
              <Button
                label="Finish setup"
                loading={c.finishing}
                disabled={!c.canFinish || c.finishing}
                onPress={onFinish}
              />
            ) : (
              <Button label="Next" onPress={c.next} />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
