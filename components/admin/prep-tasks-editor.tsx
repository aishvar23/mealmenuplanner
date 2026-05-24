"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PrepTaskDto } from "@/lib/services/admin/dto";

import { AdminApiError, addPrepTask, removePrepTask } from "./admin-api";

/**
 * Prep-task editor (docs/06, P3-6): task name, required-before minutes,
 * description (e.g. "soak chickpeas 480 min ahead" → prep-aware suggestions).
 */
export function PrepTasksEditor({
  dishId,
  prepTasks,
  onChanged,
}: {
  dishId: string;
  prepTasks: PrepTaskDto[];
  onChanged: () => Promise<void> | void;
}) {
  const [taskName, setTaskName] = useState("");
  const [minutes, setMinutes] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!taskName.trim() || minutes === "") {
      setError("Enter a task name and a lead time.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addPrepTask(dishId, {
        taskName: taskName.trim(),
        requiredBeforeMinutes: Number(minutes),
        description: description.trim() || null,
      });
      setTaskName("");
      setMinutes("");
      setDescription("");
      await onChanged();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to add.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(taskId: string) {
    setBusy(true);
    setError(null);
    try {
      await removePrepTask(dishId, taskId);
      await onChanged();
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to remove.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4">
      <h2 className="font-heading text-lg font-semibold">Advance prep</h2>

      {prepTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No prep tasks.</p>
      ) : (
        <ul className="grid gap-2 text-sm">
          {prepTasks.map((task) => (
            <li
              key={task.id}
              className="flex items-start justify-between gap-2 border-b pb-2"
            >
              <span>
                <span className="font-medium">{task.taskName}</span>{" "}
                <span className="text-muted-foreground">
                  — {task.requiredBeforeMinutes} min ahead
                </span>
                {task.description ? (
                  <span className="block text-muted-foreground">
                    {task.description}
                  </span>
                ) : null}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => remove(task.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid gap-3 border-t pt-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="task-name">Task</Label>
            <Input
              id="task-name"
              value={taskName}
              onChange={(event) => setTaskName(event.target.value)}
              placeholder="Soak chickpeas"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="task-minutes">Required before (min)</Label>
            <Input
              id="task-minutes"
              type="number"
              min={0}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              placeholder="480"
            />
          </div>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="task-desc">Description</Label>
          <Textarea
            id="task-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Soak overnight or at least 8 hours before cooking."
          />
        </div>
        <div>
          <Button type="submit" size="lg" disabled={busy}>
            Add prep task
          </Button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
