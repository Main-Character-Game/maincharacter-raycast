import { postJson, type ApiClientConfig } from "./client";

export type QuickAddRequest = {
  title: string;
  notes?: string;
  source: "raycast_extension";
  idempotencyKey: string;
};

export type QuickAddSuccessResponse = {
  ok: true;
  task: {
    id: string;
    title: string;
    url?: string;
  };
  requestId: string;
};

type QuickAddTask = QuickAddSuccessResponse["task"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asTask(value: unknown): QuickAddTask | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  const title = value.title;
  const url = value.url;

  if (typeof id !== "string" || id.trim().length === 0) return null;
  if (typeof title !== "string" || title.trim().length === 0) return null;
  if (url !== undefined && typeof url !== "string") return null;

  return {
    id,
    title,
    ...(typeof url === "string" ? { url } : {}),
  };
}

export function parseQuickAddSuccess(
  payload: unknown,
): QuickAddSuccessResponse {
  if (!isRecord(payload)) {
    throw new Error("Main Character returned an empty or invalid response.");
  }

  if (payload.ok === false) {
    const message =
      typeof payload.error === "string" && payload.error.trim().length > 0
        ? payload.error
        : "Main Character rejected this request.";
    throw new Error(message);
  }

  // Accept known response variants while normalizing to one stable shape.
  const topLevelTask = asTask(payload.task);
  const nestedTask = isRecord(payload.data) ? asTask(payload.data.task) : null;
  const task = topLevelTask ?? nestedTask;

  if (!task) {
    throw new Error("Main Character returned success without a task payload.");
  }

  const requestId =
    typeof payload.requestId === "string" && payload.requestId.trim().length > 0
      ? payload.requestId
      : isRecord(payload.data) &&
          typeof payload.data.requestId === "string" &&
          payload.data.requestId.trim().length > 0
        ? payload.data.requestId
        : "unknown";

  return {
    ok: true,
    task,
    requestId,
  };
}

export async function createQuickAddTask(
  config: ApiClientConfig,
  request: QuickAddRequest,
): Promise<QuickAddSuccessResponse> {
  const payload = await postJson<unknown>({
    config,
    path: "/api/tasks/quick-add",
    body: request,
  });

  return parseQuickAddSuccess(payload);
}
