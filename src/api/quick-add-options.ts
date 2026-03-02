import { getJson, type ApiClientConfig } from "./client";

export type QuickAddColumnOption = {
  id: string;
  name: string;
};

export type QuickAddOptionsResponse = {
  ok: true;
  defaultColumnId?: string;
  columns: QuickAddColumnOption[];
  requestId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asColumn(value: unknown): QuickAddColumnOption | null {
  if (!isRecord(value)) return null;
  const id = asNonEmptyString(value.id);
  const name = asNonEmptyString(value.name);
  if (!id || !name) return null;
  return { id, name };
}

function asColumns(value: unknown): QuickAddColumnOption[] | null {
  if (!Array.isArray(value)) return null;
  const parsedColumns = value
    .map((entry) => asColumn(entry))
    .filter((entry): entry is QuickAddColumnOption => entry !== null);

  if (parsedColumns.length !== value.length) return null;
  return parsedColumns;
}

export function parseQuickAddOptions(
  payload: unknown,
): QuickAddOptionsResponse {
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

  const payloadData = isRecord(payload.data) ? payload.data : null;
  const columns = asColumns(payload.columns) ?? asColumns(payloadData?.columns);
  if (!columns) {
    throw new Error("Main Character returned an invalid columns payload.");
  }

  const defaultColumnId =
    asNonEmptyString(payload.defaultColumnId) ??
    asNonEmptyString(payloadData?.defaultColumnId) ??
    undefined;

  const requestId =
    asNonEmptyString(payload.requestId) ??
    asNonEmptyString(payloadData?.requestId) ??
    "unknown";

  return {
    ok: true,
    defaultColumnId,
    columns,
    requestId,
  };
}

export async function getQuickAddOptions(
  config: ApiClientConfig,
): Promise<QuickAddOptionsResponse> {
  const payload = await getJson<unknown>({
    config,
    path: "/api/tasks/quick-add/options",
  });

  return parseQuickAddOptions(payload);
}
