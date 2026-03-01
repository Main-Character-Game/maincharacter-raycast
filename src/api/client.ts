const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 200;

export type ApiClientConfig = {
  baseUrl: string;
  personalAccessToken: string;
};

export type ApiErrorPayload = {
  ok?: boolean;
  code?: string;
  error?: string;
  message?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(params: {
    status: number;
    message: string;
    code?: string | null;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code ?? null;
  }
}

export class NetworkError extends Error {
  readonly kind: "timeout" | "network";

  constructor(kind: "timeout" | "network", message: string) {
    super(message);
    this.name = "NetworkError";
    this.kind = kind;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetriableApiStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetriableError(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError) return isRetriableApiStatus(error.status);
  return false;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkError(
        "timeout",
        "Couldn’t reach Main Character. Try again.",
      );
    }

    throw new NetworkError(
      "network",
      "Couldn’t reach Main Character. Try again.",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function postJson<TResponse>(params: {
  config: ApiClientConfig;
  path: string;
  body: Record<string, unknown>;
}): Promise<TResponse> {
  const endpoint = new URL(params.path, params.config.baseUrl).toString();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.config.personalAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params.body),
        },
        REQUEST_TIMEOUT_MS,
      );

      const payload = (await parseJsonSafely(response)) as
        | ApiErrorPayload
        | TResponse
        | null;

      if (!response.ok) {
        const apiErrorPayload = (payload ?? null) as ApiErrorPayload | null;
        const normalizedErrorMessage =
          apiErrorPayload?.error?.trim() || apiErrorPayload?.message?.trim();
        throw new ApiError({
          status: response.status,
          code: apiErrorPayload?.code ?? null,
          message:
            normalizedErrorMessage ||
            `Request failed with status ${response.status}`,
        });
      }

      return payload as TResponse;
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isRetriableError(error)) {
        throw error;
      }
      await sleep(RETRY_BACKOFF_MS);
    }
  }

  throw new Error("Unexpected request failure");
}
