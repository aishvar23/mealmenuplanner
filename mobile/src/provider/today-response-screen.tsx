import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  componentChoices,
  cutoffRemainingMs,
  DEFAULT_INCREMENT_MAX,
  formatCountdown,
  initialFormState,
  isResponseLocked,
  isResponseReadOnly,
  providerComponentGroupLabel,
  PROVIDER_RESPONSE_STATUS_LABELS,
  PROVIDER_SALT_OPTIONS,
  PROVIDER_SPICE_OPTIONS,
  selectChoice,
  selectSingle,
  setIncrement,
  setSaltLevel,
  setSpiceLevel,
  toggleMulti,
  toSaveRequest,
  type ComponentSelection,
  type ResponseFormState,
} from "@mmp/shared/provider";
import type {
  CustomizationGroupDto,
  MemberResponseDto,
  MenuComponentDto,
  MenuDayDto,
} from "@mmp/shared/provider";

import { ApiError } from "@/api/errors";
import { Button } from "@/components/Button";
import { ErrorBanner, LoadingState } from "@/components/Feedback";
import { SelectChips } from "@/components/SelectChips";
import { TextField } from "@/components/TextField";

import { MemberSuggestions } from "./member-suggestions";
import { providerStatusTextClass } from "./status-style";
import { useTodayResponse } from "./use-today-response";

/** setTimeout's max 32-bit delay (~24.8 days); longer delays overflow and fire at once. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * Member Today's Menu + response (MP-C-040/041, the mobile twin of the web
 * `TodayResponseView`, spec §14.2/§14.3). Shows the day's components — default
 * package, alternatives, spice/salt, customization extras — and lets an approved
 * member confirm / update / cancel before the cutoff. After the cutoff (or once the
 * menu/response locks) it is read-only with a clear status (BR-001). Lock state is
 * server-authoritative (`isResponseLocked`); the live countdown uses the clock.
 *
 * The screen is presentational over `useTodayResponse`; the screen test mocks that
 * hook, mirroring the members-screen test (mobile UI E2E is deferred — ADR-17/Q-8).
 */
export function TodayResponseScreen({ providerId }: { providerId: string }) {
  const {
    menu,
    response,
    isLoading,
    error,
    refetchResponse,
    save,
    confirm,
    cancel,
  } = useTodayResponse(providerId);

  if (isLoading) return <LoadingState />;
  if (error || !menu) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
        <View className="p-5">
          {error ? (
            <ErrorBanner message="Couldn't load today's menu." />
          ) : (
            <Text className="text-base text-gray-600">
              No menu has been published for today yet. Check back soon.
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // `response` is loaded once the menu resolves (the hook gates its query on the
  // menu day); render a spinner for the brief window before it arrives.
  if (!response) return <LoadingState />;

  return (
    <ResponseForm
      menu={menu}
      response={response}
      reloadResponse={async () => {
        const { data } = await refetchResponse();
        return data;
      }}
      saveResponse={save.mutateAsync}
      confirmResponse={confirm.mutateAsync}
      cancelResponse={cancel.mutateAsync}
      mutating={save.isPending || confirm.isPending || cancel.isPending}
    />
  );
}

function ResponseForm({
  menu,
  response,
  reloadResponse,
  saveResponse,
  confirmResponse,
  cancelResponse,
  mutating,
}: {
  menu: MenuDayDto;
  response: MemberResponseDto;
  reloadResponse: () => Promise<MemberResponseDto | undefined>;
  saveResponse: (
    body: ReturnType<typeof toSaveRequest>,
  ) => Promise<MemberResponseDto>;
  confirmResponse: (responseId: string) => Promise<MemberResponseDto>;
  cancelResponse: (responseId: string) => Promise<MemberResponseDto>;
  mutating: boolean;
}) {
  const [form, setForm] = useState<ResponseFormState>(() =>
    initialFormState(menu, response),
  );
  const [memberNote, setMemberNote] = useState(response.memberNote ?? "");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Re-seed the working form whenever an authoritative response arrives.
  useEffect(() => {
    setForm(initialFormState(menu, response));
    setMemberNote(response.memberNote ?? "");
    setDirty(false);
  }, [menu, response]);

  // Read-only flips once at the cutoff (a single timer), not every second — only the
  // <Countdown/> below re-renders per tick. Locked-by-state is clock-free.
  const lockedByState = isResponseLocked(menu, response);
  const [cutoffReached, setCutoffReached] = useState(false);
  useEffect(() => {
    if (lockedByState) return;
    // One timer that fires at the cutoff (re-armed in ≤24.8d hops so a far-future
    // cutoff doesn't overflow setTimeout's 32-bit delay and fire immediately).
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const remaining = cutoffRemainingMs(menu, new Date());
      if (remaining <= 0) {
        setCutoffReached(true);
        return;
      }
      id = setTimeout(schedule, Math.min(remaining, MAX_TIMER_DELAY_MS));
    };
    schedule();
    return () => clearTimeout(id);
  }, [menu, lockedByState]);

  const readOnly = lockedByState || cutoffReached;
  const noteDirty = (response.memberNote ?? "") !== memberNote;
  const canSave = !readOnly && (dirty || noteDirty);

  /**
   * Re-check read-only with a fresh clock before any mutation. `readOnly`/`cutoffReached`
   * can lag the real cutoff in the window before the timer fires (e.g. a just-past-cutoff
   * menu that hasn't locked yet), so guard the action itself, not just the disabled state.
   */
  function ensureOpen(): boolean {
    if (isResponseReadOnly(menu, response, new Date())) {
      setErrorMsg("Responses are closed for today.");
      return false;
    }
    return true;
  }

  function edit(next: ResponseFormState) {
    setForm(next);
    setDirty(true);
    setMessage(null);
  }

  async function persist(): Promise<MemberResponseDto | null> {
    const expectedVersion = response.responseId ? response.version : null;
    try {
      return await saveResponse(
        toSaveRequest(menu, form, expectedVersion, memberNote),
      );
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        (err.details as { reason?: string } | undefined)?.reason ===
          "stale_version"
      ) {
        await reloadResponse();
        setErrorMsg(
          "Your response changed in another place, so we reloaded it. Review and try again.",
        );
        return null;
      }
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    }
  }

  async function onSaveDraft() {
    if (!canSave) return;
    setErrorMsg(null);
    if (!ensureOpen()) return;
    const saved = await persist();
    if (saved) setMessage("Saved.");
  }

  async function onConfirm() {
    setErrorMsg(null);
    if (!ensureOpen()) return;
    try {
      let current: MemberResponseDto | null = response;
      if (canSave || !response.responseId || response.status === "cancelled") {
        current = await persist();
        if (!current) return;
      }
      if (current.responseId) {
        await confirmResponse(current.responseId);
        setMessage("Order confirmed.");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function onCancel() {
    if (!response.responseId) return;
    setErrorMsg(null);
    if (!ensureOpen()) return;
    try {
      await cancelResponse(response.responseId);
      setMessage("Order cancelled.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const canCancel =
    !readOnly &&
    response.responseId !== null &&
    (response.status === "draft" || response.status === "confirmed");

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ScrollView
        contentContainerClassName="gap-4 p-5 pb-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <Text className="text-2xl font-bold text-gray-900">
            Today&rsquo;s menu
          </Text>
          <Text className="text-sm text-gray-500">{menu.menuDate}</Text>
          <Text
            className={`text-sm font-medium ${providerStatusTextClass(response.status)}`}
            accessibilityRole="text"
          >
            {PROVIDER_RESPONSE_STATUS_LABELS[response.status]}
          </Text>
          {readOnly ? (
            <Text className="text-sm text-gray-600">
              Responses are closed for today.
            </Text>
          ) : (
            <Countdown menu={menu} />
          )}
          {menu.note ? (
            <Text className="mt-1 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
              {menu.note}
            </Text>
          ) : null}
        </View>

        {readOnly ? (
          <Text className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
            This menu is locked. To change your order now, contact your provider
            outside the app.
          </Text>
        ) : null}
        {errorMsg ? <ErrorBanner message={errorMsg} /> : null}
        {message ? (
          <Text className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {message}
          </Text>
        ) : null}

        {menu.components.map((component) => {
          const selection = form[component.menuComponentId];
          if (!selection) return null;
          return (
            <ComponentCard
              key={component.menuComponentId}
              component={component}
              selection={selection}
              readOnly={readOnly}
              onForm={edit}
              form={form}
            />
          );
        })}

        <TextField
          label="Note for your provider (optional)"
          value={memberNote}
          onChangeText={(t) => {
            setMemberNote(t);
            setMessage(null);
          }}
          editable={!readOnly}
          placeholder="Any preferences for today?"
        />

        {!readOnly ? (
          <View className="gap-3">
            {response.status === "confirmed" ? (
              <Button
                label="Save changes"
                loading={mutating}
                disabled={!canSave}
                onPress={() => void onSaveDraft()}
              />
            ) : (
              <>
                <Button
                  label="Confirm order"
                  loading={mutating}
                  onPress={() => void onConfirm()}
                />
                <Button
                  label="Save draft"
                  variant="secondary"
                  disabled={!canSave}
                  onPress={() => void onSaveDraft()}
                />
              </>
            )}
            {canCancel ? (
              <Button
                label="Cancel order"
                variant="danger"
                disabled={mutating}
                onPress={() => void onCancel()}
              />
            ) : null}
          </View>
        ) : null}

        <MemberSuggestions menuDayId={menu.menuDayId} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** The live cutoff countdown — its own 1s clock so only this text re-renders each tick. */
function Countdown({ menu }: { menu: MenuDayDto }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const initial = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, []);
  const remaining = now ? formatCountdown(cutoffRemainingMs(menu, now)) : "—";
  return (
    <Text className="text-sm text-gray-600">{`Closes in ${remaining}`}</Text>
  );
}

function ComponentCard({
  component,
  selection,
  readOnly,
  form,
  onForm,
}: {
  component: MenuComponentDto;
  selection: ComponentSelection;
  readOnly: boolean;
  form: ResponseFormState;
  onForm: (next: ResponseFormState) => void;
}) {
  const choices = componentChoices(component);
  return (
    <View className="gap-3 rounded-xl border border-gray-100 bg-white p-4">
      <Text className="text-base font-semibold text-gray-900">
        {providerComponentGroupLabel(component.componentGroup)}
        {component.isRequired ? (
          <Text className="text-sm font-normal text-gray-400"> · required</Text>
        ) : null}
      </Text>

      {/* Choices labelled by dish name (ADO #39). */}
      {choices.length > 1 ? (
        <SelectChips
          mode="single"
          disabled={readOnly}
          options={choices.map((c) => ({
            value: c.catalogItemId,
            label: `${c.itemName} · ${c.quantity} ${c.canonicalUnit}${c.isDefault ? " · Default" : ""}`,
          }))}
          selected={[selection.selectedCatalogItemId]}
          onChange={(next) => {
            const picked = next[0] ?? component.defaultCatalogItemId;
            onForm(selectChoice(form, component, picked));
          }}
        />
      ) : (
        <Text className="text-sm text-gray-500">
          {choices[0]!.itemName} · {choices[0]!.quantity}{" "}
          {choices[0]!.canonicalUnit}
        </Text>
      )}

      {component.supportsSpiceLevel ? (
        <View className="gap-1.5">
          <Text className="text-xs font-medium text-gray-500">Spice</Text>
          <SelectChips
            mode="single"
            disabled={readOnly}
            options={PROVIDER_SPICE_OPTIONS}
            selected={selection.spiceLevel ? [selection.spiceLevel] : []}
            onChange={(next) =>
              onForm(
                setSpiceLevel(form, component.menuComponentId, next[0] ?? null),
              )
            }
          />
        </View>
      ) : null}
      {component.supportsSaltLevel ? (
        <View className="gap-1.5">
          <Text className="text-xs font-medium text-gray-500">Salt</Text>
          <SelectChips
            mode="single"
            disabled={readOnly}
            options={PROVIDER_SALT_OPTIONS}
            selected={selection.saltLevel ? [selection.saltLevel] : []}
            onChange={(next) =>
              onForm(
                setSaltLevel(form, component.menuComponentId, next[0] ?? null),
              )
            }
          />
        </View>
      ) : null}

      {component.customizationGroups.map((group) => (
        <CustomizationGroup
          key={group.customizationGroupId}
          group={group}
          component={component}
          selection={selection}
          readOnly={readOnly}
          form={form}
          onForm={onForm}
        />
      ))}
    </View>
  );
}

function CustomizationGroup({
  group,
  component,
  selection,
  readOnly,
  form,
  onForm,
}: {
  group: CustomizationGroupDto;
  component: MenuComponentDto;
  selection: ComponentSelection;
  readOnly: boolean;
  form: ResponseFormState;
  onForm: (next: ResponseFormState) => void;
}) {
  const optionIds = group.options.map((o) => o.optionId);
  const componentId = component.menuComponentId;
  const isSelected = (optionId: string) =>
    selection.customizations.some((c) => c.optionId === optionId);

  return (
    <View className="gap-2 rounded-lg bg-gray-50 p-3">
      <Text className="text-xs font-medium text-gray-700">
        {group.name}
        {group.isRequired ? " *" : ""}
        {!group.includedInPrice ? (
          <Text className="text-gray-400"> (extra)</Text>
        ) : null}
      </Text>
      {group.options.map((option) => {
        const priceLabel = option.externalPriceLabel
          ? ` ${option.externalPriceLabel}`
          : "";
        if (group.customizationType === "quantity_increment") {
          const current =
            selection.customizations.find((c) => c.optionId === option.optionId)
              ?.quantity ?? 0;
          const max = option.maximumQuantity ?? DEFAULT_INCREMENT_MAX;
          return (
            <View
              key={option.optionId}
              className="flex-row items-center justify-between gap-2"
            >
              <Text className="flex-1 text-sm text-gray-800">
                {option.label}
                {priceLabel ? (
                  <Text className="text-gray-400">{priceLabel}</Text>
                ) : null}
              </Text>
              <View className="flex-row items-center gap-3">
                <Stepper
                  label={`Decrease ${option.label}`}
                  symbol="−"
                  disabled={readOnly || current <= 0}
                  onPress={() =>
                    onForm(
                      setIncrement(
                        form,
                        componentId,
                        option.optionId,
                        Math.max(0, current - 1),
                      ),
                    )
                  }
                />
                <Text className="w-5 text-center text-base text-gray-900">
                  {current}
                </Text>
                <Stepper
                  label={`Increase ${option.label}`}
                  symbol="+"
                  disabled={readOnly || current >= max}
                  onPress={() =>
                    onForm(
                      setIncrement(
                        form,
                        componentId,
                        option.optionId,
                        Math.min(max, current + 1),
                      ),
                    )
                  }
                />
              </View>
            </View>
          );
        }
        if (group.customizationType === "text_note") {
          return (
            <Text key={option.optionId} className="text-xs text-gray-500">
              {option.label}
            </Text>
          );
        }
        const multi = group.customizationType === "multi_select";
        const active = isSelected(option.optionId);
        return (
          <Pressable
            key={option.optionId}
            accessibilityRole={multi ? "checkbox" : "radio"}
            accessibilityState={{ selected: active, disabled: readOnly }}
            disabled={readOnly}
            onPress={() =>
              onForm(
                multi
                  ? toggleMulti(
                      form,
                      componentId,
                      optionIds,
                      option.optionId,
                      group.maximumSelections,
                    )
                  : selectSingle(form, componentId, optionIds, option.optionId),
              )
            }
            className={`flex-row items-center justify-between rounded-lg border px-3 py-2 ${
              active
                ? "border-green-600 bg-green-50"
                : "border-gray-300 bg-white"
            } ${readOnly ? "opacity-50" : ""}`}
          >
            <Text
              className={`text-sm ${active ? "font-semibold text-green-700" : "text-gray-700"}`}
            >
              {option.label}
            </Text>
            {priceLabel ? (
              <Text className="text-xs text-gray-400">{priceLabel}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function Stepper({
  label,
  symbol,
  disabled,
  onPress,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`size-9 items-center justify-center rounded-lg border border-gray-300 bg-white ${
        disabled ? "opacity-40" : "active:bg-gray-100"
      }`}
    >
      <Text className="text-lg text-gray-900">{symbol}</Text>
    </Pressable>
  );
}
