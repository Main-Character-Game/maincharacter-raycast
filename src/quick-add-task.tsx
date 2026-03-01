import {
  Action,
  ActionPanel,
  Form,
  LaunchProps,
  LocalStorage,
  getSelectedText,
  open,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { createQuickAddTask } from "./api/quick-add";
import { toUserFacingError } from "./lib/errors";
import { getRuntimePreferences } from "./lib/preferences";
import { normalizeQuickAddInput } from "./lib/validation";

type CommandArguments = {
  title?: string;
};

const OPEN_AFTER_CREATE_STORAGE_KEY = "quick-add-open-after-create";

function generateIdempotencyKey(): string {
  const cryptoFromGlobal = globalThis.crypto;
  if (cryptoFromGlobal && typeof cryptoFromGlobal.randomUUID === "function") {
    return cryptoFromGlobal.randomUUID();
  }

  return `raycast-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function QuickAddTaskCommand(
  props: LaunchProps<{ arguments: CommandArguments }>,
) {
  const [title, setTitle] = useState(props.arguments.title?.trim() ?? "");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openAfterCreate, setOpenAfterCreate] = useState(false);

  useEffect(() => {
    let cancelled = false;

    LocalStorage.getItem<string>(OPEN_AFTER_CREATE_STORAGE_KEY)
      .then((value) => {
        if (cancelled) return;
        setOpenAfterCreate(value === "true");
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (title.trim().length > 0) return;

    getSelectedText()
      .then((selectedText) => {
        if (cancelled) return;
        const nextTitle = selectedText.trim();
        if (nextTitle.length > 0) {
          setTitle(nextTitle);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [title]);

  async function persistOpenAfterCreate(nextValue: boolean): Promise<void> {
    setOpenAfterCreate(nextValue);
    await LocalStorage.setItem(
      OPEN_AFTER_CREATE_STORAGE_KEY,
      String(nextValue),
    );
  }

  async function handleSubmit(): Promise<void> {
    setIsSubmitting(true);

    try {
      const prefs = getRuntimePreferences();
      const normalizedInput = normalizeQuickAddInput({ title, notes });
      const result = await createQuickAddTask(prefs, {
        ...normalizedInput,
        idempotencyKey: generateIdempotencyKey(),
        source: "raycast_extension",
      });

      const taskUrl =
        result.task.url ??
        `${prefs.baseUrl}/app/tasks?taskId=${encodeURIComponent(result.task.id)}`;

      if (openAfterCreate) {
        try {
          await open(taskUrl);
        } catch {
          await showToast({
            style: Toast.Style.Success,
            title: "Task created",
            message: "Couldn’t open browser automatically.",
          });
        }
      } else {
        const toast = await showToast({
          style: Toast.Style.Success,
          title: "Task created",
        });

        toast.primaryAction = {
          title: "Go to Task",
          onAction: () => open(taskUrl),
        };
      }

      setTitle("");
      setNotes("");
    } catch (error) {
      const userError = toUserFacingError(error);
      const toast = await showToast({
        style: Toast.Style.Failure,
        title: userError.title,
        message: userError.message,
      });

      if (userError.openPreferences) {
        toast.primaryAction = {
          title: "Open Preferences",
          onAction: () => openExtensionPreferences(),
        };
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Task" onSubmit={handleSubmit} />
          <Action
            title="Open Extension Preferences"
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        placeholder="What needs to get done?"
        value={title}
        onChange={setTitle}
        autoFocus
      />
      <Form.TextArea
        id="notes"
        title="Notes"
        placeholder="Optional notes"
        value={notes}
        onChange={setNotes}
      />
      <Form.Checkbox
        id="openAfterCreate"
        label="Open task in Main Character after create"
        value={openAfterCreate}
        onChange={(nextValue) => {
          void persistOpenAfterCreate(nextValue).catch(() => undefined);
        }}
      />
    </Form>
  );
}
