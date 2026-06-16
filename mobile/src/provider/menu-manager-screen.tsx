import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  activeCatalog,
  defaultCutoffLocalIso,
  dishCountLabel,
  editCatalog,
  emptyMenuBuilderState,
  formatCutoffCountdown,
  isMenuDayEditable,
  isMenuDayNoteEditable,
  menuBuilderStateFromMenuDay,
  menuBuilderStateToCreateInput,
  menuBuilderStateToEditInput,
  menuDayNoteChanged,
  MENU_NOTE_MAX_LENGTH,
  providerMenuStatusLabel,
  providerTodayDate,
  summarizeMenuIssues,
  toUpdateMenuDayNoteInput,
  validateMenuCompleteness,
  type MenuBuilderState,
  type MenuDayDto,
} from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { EmptyState, ErrorState, LoadingState } from "@/components/Feedback";
import { TextField } from "@/components/TextField";

import { MenuBuilderForm } from "./menu-builder-form";
import { OwnerDaySuggestions } from "./owner-day-suggestions";
import { providerMenuStatusTextClass } from "./status-style";
import { useMenuManager } from "./use-menu-manager";

/**
 * Owner menu manager screen (MP-C-030, the mobile twin of the web menu page, spec
 * §13.3). Lists this week's menu days with status, cutoff + live countdown, and dish
 * count; lets the owner author a DRAFT via the structured builder and publish a
 * complete draft. Publishing is completeness-gated by the SHARED
 * `validateMenuCompleteness` (the #84 validator), mirroring the publish gate. Each
 * non-terminal day also carries a lightweight in-place NOTE editor (`updateNote` / PATCH) —
 * distinct from the structural builder: a note edit never starts a revision and stays
 * available on locked / past-cutoff days. Member suggestions UI is the remainder of #22.
 */
/** The user-facing message for a failed note save (mirrors the web `onSaveNote` fallback). */
function noteErrorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  return error instanceof Error ? error.message : "Couldn't save the note.";
}

export function MenuManagerScreen({ providerId }: { providerId: string }) {
  const { weeklyMenu, catalog, create, publish, revise, updateNote } =
    useMenuManager(providerId);
  const [building, setBuilding] = useState(false);
  const [editing, setEditing] = useState<MenuDayDto | null>(null);

  // A minute-ticking clock so the countdown + publishable gate stay current.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const builderOpen = building || editing !== null;
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Memoize the active catalog so the builder-state/catalog memos below have a stable input
  // across minute-ticks (catalog.data identity is stable while unchanged).
  const active = useMemo(
    () => activeCatalog(catalog.data ?? []),
    [catalog.data],
  );
  // For an edit, surface any archived item the day still references so the owner can
  // see/replace it instead of it silently vanishing from the picker (review #1/#2).
  const builderCatalog = useMemo(
    () => (editing ? editCatalog(active, editing) : active),
    [editing, active],
  );
  // Build the starting state ONLY while the builder is open, so idle minute-ticks don't
  // deep-map the day's component tree (review #8).
  const initialState = useMemo<MenuBuilderState | null>(() => {
    if (!builderOpen) return null;
    return editing
      ? menuBuilderStateFromMenuDay(editing)
      : emptyMenuBuilderState(
          providerTodayDate(deviceTz, new Date(nowMs)),
          defaultCutoffLocalIso(new Date(nowMs)),
        );
  }, [builderOpen, editing, nowMs, deviceTz]);

  if (weeklyMenu.isLoading || catalog.isLoading) return <LoadingState />;
  if (weeklyMenu.error || catalog.error || !weeklyMenu.data || !catalog.data) {
    return (
      <ErrorState
        message="Couldn't load the menu."
        onRetry={() => {
          weeklyMenu.refetch();
          catalog.refetch();
        }}
      />
    );
  }

  const days = weeklyMenu.data;
  // The active write for the open builder — revise when editing a day, else create.
  const saving = editing ? revise : create;

  function closeBuilder() {
    setBuilding(false);
    setEditing(null);
  }

  // Save just the day's note via the PATCH route (in place, never a revision). Returns
  // whether the write landed so the card closes its inline editor only on success.
  async function onSaveNote(day: MenuDayDto, raw: string): Promise<boolean> {
    try {
      await updateNote.mutateAsync({
        menuDayId: day.menuDayId,
        input: toUpdateMenuDayNoteInput(raw),
      });
      return true;
    } catch {
      return false;
    }
  }

  async function onSave(next: MenuBuilderState) {
    // Mirror the web form's submit: keep the builder open on failure (the error is
    // surfaced via the mutation's `error` in the builder) and never let the rejection
    // escape unhandled. Only close once the write actually lands.
    try {
      if (editing) {
        await revise.mutateAsync({
          menuDayId: editing.menuDayId,
          input: menuBuilderStateToEditInput(next),
        });
      } else {
        await create.mutateAsync(menuBuilderStateToCreateInput(next));
      }
      closeBuilder();
    } catch {
      // Error shown inline via the mutation's error; leave the builder open to retry.
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ScrollView contentContainerClassName="gap-4 p-5 pb-10">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-gray-900">Weekly menu</Text>
          {active.length > 0 && !builderOpen ? (
            <Button
              label="New"
              onPress={() => {
                setEditing(null);
                setBuilding(true);
              }}
            />
          ) : null}
        </View>

        {active.length === 0 ? (
          <View className="rounded-xl border border-gray-100 bg-white p-4">
            <EmptyState
              title="Add catalog items first"
              hint="Your menu is built from your catalog. Add dishes before building a day's menu."
            />
          </View>
        ) : null}

        {builderOpen && initialState ? (
          <MenuBuilderForm
            catalog={builderCatalog}
            mode={editing ? "edit" : "create"}
            initialState={initialState}
            showRevisionWarning={editing?.status === "published"}
            requirePublishable={editing?.status === "published"}
            now={nowMs}
            submitting={saving.isPending}
            error={saving.error instanceof Error ? saving.error.message : null}
            onSubmit={onSave}
            onCancel={closeBuilder}
          />
        ) : null}

        {days.length === 0 && active.length > 0 && !builderOpen ? (
          <View className="rounded-xl border border-gray-100 bg-white p-4">
            <EmptyState
              title="No menu days this week yet"
              hint="Use “New” to author and publish a day's menu."
            />
          </View>
        ) : null}

        {days.map((day) => (
          <MenuDayCard
            key={day.menuDayId}
            day={day}
            nowMs={nowMs}
            publishing={
              publish.isPending && publish.variables === day.menuDayId
            }
            onPublish={() => publish.mutate(day.menuDayId)}
            editable={!builderOpen && isMenuDayEditable(day, nowMs)}
            onEdit={() => {
              setBuilding(false);
              setEditing(day);
            }}
            noteEditable={!builderOpen && isMenuDayNoteEditable(day)}
            savingNote={
              updateNote.isPending &&
              updateNote.variables?.menuDayId === day.menuDayId
            }
            noteError={
              updateNote.variables?.menuDayId === day.menuDayId
                ? noteErrorMessage(updateNote.error)
                : null
            }
            onSaveNote={(raw) => onSaveNote(day, raw)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuDayCard({
  day,
  nowMs,
  publishing,
  onPublish,
  editable,
  onEdit,
  noteEditable,
  savingNote,
  noteError,
  onSaveNote,
}: {
  day: MenuDayDto;
  nowMs: number;
  publishing: boolean;
  onPublish: () => void;
  editable: boolean;
  onEdit: () => void;
  noteEditable: boolean;
  savingNote: boolean;
  noteError: string | null;
  onSaveNote: (raw: string) => Promise<boolean>;
}) {
  const countdown = formatCutoffCountdown(day.cutoffAt, nowMs);
  const issues = validateMenuCompleteness(day, new Date(nowMs));
  const publishable = issues.length === 0;
  const isDraft = day.status === "draft";

  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(day.note ?? "");

  function openNoteEditor() {
    setNoteDraft(day.note ?? "");
    setEditingNote(true);
  }

  async function saveNote() {
    const ok = await onSaveNote(noteDraft);
    if (ok) setEditingNote(false);
  }

  return (
    <View className="gap-2 rounded-xl border border-gray-100 bg-white p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="font-medium text-gray-900">{day.menuDate}</Text>
        <Text
          className={`text-xs font-medium ${providerMenuStatusTextClass(day.status)}`}
        >
          {providerMenuStatusLabel(day.status)}
        </Text>
        {day.revision > 1 ? (
          <Text className="text-xs text-gray-500">Rev {day.revision}</Text>
        ) : null}
      </View>
      <Text className="text-sm text-gray-500">
        {dishCountLabel(day.components.length)}
      </Text>
      <Text
        className={`text-sm font-medium ${countdown.passed ? "text-gray-500" : "text-green-700"}`}
      >
        {countdown.label}
      </Text>

      {editingNote ? (
        <View className="gap-2">
          <TextField
            label="Note"
            accessibilityLabel="Menu day note"
            value={noteDraft}
            multiline
            maxLength={MENU_NOTE_MAX_LENGTH}
            placeholder="A note shown to members for this day's menu."
            onChangeText={setNoteDraft}
          />
          {noteError ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600"
            >
              {noteError}
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            <Button
              label={savingNote ? "Saving…" : "Save note"}
              onPress={saveNote}
              disabled={savingNote || !menuDayNoteChanged(day, noteDraft)}
            />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setEditingNote(false)}
              disabled={savingNote}
            />
          </View>
        </View>
      ) : day.note ? (
        <Text className="text-sm text-gray-500">{day.note}</Text>
      ) : null}

      {isDraft && !publishable ? (
        <View className="gap-0.5">
          {summarizeMenuIssues(issues).map((message) => (
            <Text key={message} className="text-sm text-gray-500">
              • {message}
            </Text>
          ))}
        </View>
      ) : null}

      {!editingNote && (isDraft || editable || noteEditable) ? (
        <View className="gap-2">
          {isDraft ? (
            <Button
              label={publishing ? "Publishing…" : "Publish"}
              onPress={onPublish}
              disabled={!publishable || publishing}
            />
          ) : null}
          {editable ? (
            <Button label="Edit" variant="secondary" onPress={onEdit} />
          ) : null}
          {noteEditable ? (
            <Button
              label={day.note ? "Edit note" : "Add note"}
              variant="secondary"
              onPress={openNoteEditor}
            />
          ) : null}
        </View>
      ) : null}

      {/* Members can only suggest on a published/locked day (RLS gates the insert to
          readable, non-draft days), so the owner triage shows only once published. */}
      {day.status !== "draft" ? (
        <OwnerDaySuggestions menuDayId={day.menuDayId} />
      ) : null}
    </View>
  );
}
