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
import {
  getQuickAddOptions,
  type QuickAddColumnOption,
} from "./api/quick-add-options";
import { createQuickAddTask } from "./api/quick-add";
import { toUserFacingError } from "./lib/errors";
import { getRuntimePreferences } from "./lib/preferences";
import { normalizeQuickAddInput } from "./lib/validation";

type CommandArguments = {
  title?: string;
};

const OPEN_AFTER_CREATE_STORAGE_KEY = "quick-add-open-after-create";
const SELECTED_COLUMN_STORAGE_KEY = "quick-add-selected-column-id";

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
  const [isLoadingColumns, setIsLoadingColumns] = useState(true);
  const [openAfterCreate, setOpenAfterCreate] = useState(false);
  const [columnOptions, setColumnOptions] = useState<QuickAddColumnOption[]>(
    [],
  );
  const [selectedColumnId, setSelectedColumnId] = useState("");

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

    async function loadColumns(): Promise<void> {
      try {
        const prefs = getRuntimePreferences();
        const [savedColumnId, options] = await Promise.all([
          LocalStorage.getItem<string>(SELECTED_COLUMN_STORAGE_KEY),
          getQuickAddOptions(prefs),
        ]);

        if (cancelled) return;

        setColumnOptions(options.columns);
        const availableColumnIds = new Set(
          options.columns.map((col) => col.id),
        );
        const hasSavedColumn =
          typeof savedColumnId === "string" &&
          (savedColumnId.length === 0 || availableColumnIds.has(savedColumnId));

        const fallbackColumnId =
          options.defaultColumnId &&
          availableColumnIds.has(options.defaultColumnId)
            ? options.defaultColumnId
            : "";

        const nextColumnId = hasSavedColumn ? savedColumnId : fallbackColumnId;

        setSelectedColumnId(nextColumnId);
        await LocalStorage.setItem(SELECTED_COLUMN_STORAGE_KEY, nextColumnId);
      } catch (error) {
        if (cancelled) return;
        setColumnOptions([]);
        setSelectedColumnId("");

        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Couldn’t load columns. Using Main Character default.";

        await showToast({
          style: Toast.Style.Failure,
          title: "Couldn’t Load Columns",
          message,
        });
      } finally {
        if (!cancelled) {
          setIsLoadingColumns(false);
        }
      }
    }

    void loadColumns();

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

  async function persistSelectedColumnId(nextValue: string): Promise<void> {
    setSelectedColumnId(nextValue);
    await LocalStorage.setItem(SELECTED_COLUMN_STORAGE_KEY, nextValue);
  }

  async function handleSubmit(): Promise<void> {
    setIsSubmitting(true);

    try {
      const prefs = getRuntimePreferences();
      const normalizedInput = normalizeQuickAddInput({ title, notes });
      const result = await createQuickAddTask(prefs, {
        ...normalizedInput,
        ...(selectedColumnId ? { columnId: selectedColumnId } : {}),
        idempotencyKey: generateIdempotencyKey(),
        source: "raycast_extension",
      });

      const taskUrl =
        result.task.url ??
        `${prefs.baseUrl}/app/tasks/${encodeURIComponent(result.task.id)}`;

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
      isLoading={isSubmitting || isLoadingColumns}
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
      <Form.Dropdown
        id="columnId"
        title="Column"
        value={selectedColumnId}
        onChange={(nextValue) => {
          void persistSelectedColumnId(nextValue).catch(() => undefined);
        }}
      >
        <Form.Dropdown.Item value="" title="Main Character Default" />
        {columnOptions.map((column) => (
          <Form.Dropdown.Item
            key={column.id}
            value={column.id}
            title={column.name}
          />
        ))}
      </Form.Dropdown>
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
