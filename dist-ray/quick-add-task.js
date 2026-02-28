"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/quick-add-task.tsx
var quick_add_task_exports = {};
__export(quick_add_task_exports, {
  default: () => QuickAddTaskCommand
});
module.exports = __toCommonJS(quick_add_task_exports);
var import_api2 = require("@raycast/api");
var import_react = require("react");

// src/api/client.ts
var REQUEST_TIMEOUT_MS = 8e3;
var MAX_ATTEMPTS = 2;
var RETRY_BACKOFF_MS = 200;
var ApiError = class extends Error {
  status;
  code;
  constructor(params) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code ?? null;
  }
};
var NetworkError = class extends Error {
  kind;
  constructor(kind, message) {
    super(message);
    this.name = "NetworkError";
    this.kind = kind;
  }
};
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function isRetriableApiStatus(status) {
  return status === 429 || status >= 500;
}
function isRetriableError(error) {
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError) return isRetriableApiStatus(error.status);
  return false;
}
async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkError(
        "timeout",
        "Couldn\u2019t reach Main Character. Try again."
      );
    }
    throw new NetworkError("network", "Couldn\u2019t reach Main Character. Try again.");
  } finally {
    clearTimeout(timeoutId);
  }
}
async function postJson(params) {
  const endpoint = new URL(params.path, params.config.baseUrl).toString();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.config.personalAccessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(params.body)
        },
        REQUEST_TIMEOUT_MS
      );
      const payload = await parseJsonSafely(response);
      if (!response.ok) {
        const apiErrorPayload = payload ?? null;
        throw new ApiError({
          status: response.status,
          code: apiErrorPayload?.code ?? null,
          message: apiErrorPayload?.error?.trim() || `Request failed with status ${response.status}`
        });
      }
      return payload;
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isRetriableError(error)) {
        throw error;
      }
      await sleep(RETRY_BACKOFF_MS);
    }
  }
  throw new Error("Unexpected request failure");
}

// src/api/quick-add.ts
async function createQuickAddTask(config, request) {
  return postJson({
    config,
    path: "/api/tasks/quick-add",
    body: request
  });
}

// src/lib/validation.ts
var FormValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "FormValidationError";
  }
};
function normalizeQuickAddInput(input) {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new FormValidationError("Title is required.");
  }
  const notes = input.notes.trim();
  return {
    title,
    ...notes.length > 0 ? { notes } : {}
  };
}

// src/lib/preferences.ts
var import_api = require("@raycast/api");
var PreferenceError = class extends Error {
  preferenceName;
  constructor(preferenceName, message) {
    super(message);
    this.name = "PreferenceError";
    this.preferenceName = preferenceName;
  }
};
function getRuntimePreferences() {
  const prefs = (0, import_api.getPreferenceValues)();
  const baseUrl = prefs.baseUrl?.trim();
  const personalAccessToken = prefs.personalAccessToken?.trim();
  if (!baseUrl) {
    throw new PreferenceError("baseUrl", "Set API Base URL in extension preferences.");
  }
  let normalizedBaseUrl;
  try {
    normalizedBaseUrl = new URL(baseUrl);
  } catch {
    throw new PreferenceError("baseUrl", "API Base URL must be a valid absolute URL.");
  }
  if (!personalAccessToken) {
    throw new PreferenceError(
      "personalAccessToken",
      "Set Personal Access Token in extension preferences."
    );
  }
  return {
    baseUrl: normalizedBaseUrl.origin,
    personalAccessToken
  };
}

// src/lib/errors.ts
function toUserFacingError(error) {
  if (error instanceof PreferenceError) {
    return {
      title: "Setup Required",
      message: error.message,
      openPreferences: true
    };
  }
  if (error instanceof FormValidationError) {
    return {
      title: "Can\u2019t Create Task",
      message: error.message
    };
  }
  if (error instanceof NetworkError) {
    return {
      title: "Couldn\u2019t Create Task",
      message: "Couldn\u2019t reach Main Character. Try again."
    };
  }
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        title: "Authentication Failed",
        message: "Token invalid, revoked, expired, or missing required scope."
      };
    }
    if (error.status === 429) {
      return {
        title: "Rate Limited",
        message: "Too many requests. Wait a moment and try again."
      };
    }
    if (error.status === 400) {
      return {
        title: "Invalid Task",
        message: error.message
      };
    }
    return {
      title: "Couldn\u2019t Create Task",
      message: error.message
    };
  }
  return {
    title: "Couldn\u2019t Create Task",
    message: "Unexpected error. Try again."
  };
}

// src/quick-add-task.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var OPEN_AFTER_CREATE_STORAGE_KEY = "quick-add-open-after-create";
function QuickAddTaskCommand(props) {
  const [title, setTitle] = (0, import_react.useState)(props.arguments.title?.trim() ?? "");
  const [notes, setNotes] = (0, import_react.useState)("");
  const [isSubmitting, setIsSubmitting] = (0, import_react.useState)(false);
  const [openAfterCreate, setOpenAfterCreate] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    import_api2.LocalStorage.getItem(OPEN_AFTER_CREATE_STORAGE_KEY).then((value) => {
      if (cancelled) return;
      setOpenAfterCreate(value === "true");
    }).catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, []);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    if (title.trim().length > 0) return;
    (0, import_api2.getSelectedText)().then((selectedText) => {
      if (cancelled) return;
      const nextTitle = selectedText.trim();
      if (nextTitle.length > 0) {
        setTitle(nextTitle);
      }
    }).catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, [title]);
  async function persistOpenAfterCreate(nextValue) {
    setOpenAfterCreate(nextValue);
    await import_api2.LocalStorage.setItem(OPEN_AFTER_CREATE_STORAGE_KEY, String(nextValue));
  }
  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const prefs = getRuntimePreferences();
      const normalizedInput = normalizeQuickAddInput({ title, notes });
      const result = await createQuickAddTask(prefs, {
        ...normalizedInput,
        idempotencyKey: crypto.randomUUID(),
        source: "raycast_extension"
      });
      const taskUrl = result.task.url ?? `${prefs.baseUrl}/app/tasks?taskId=${encodeURIComponent(result.task.id)}`;
      if (openAfterCreate) {
        try {
          await (0, import_api2.open)(taskUrl);
        } catch {
          await (0, import_api2.showToast)({
            style: import_api2.Toast.Style.Success,
            title: "Task created",
            message: "Couldn\u2019t open browser automatically."
          });
        }
      } else {
        const toast = await (0, import_api2.showToast)({
          style: import_api2.Toast.Style.Success,
          title: "Task created"
        });
        toast.primaryAction = {
          title: "Go to Task",
          onAction: () => (0, import_api2.open)(taskUrl)
        };
      }
      setTitle("");
      setNotes("");
    } catch (error) {
      const userError = toUserFacingError(error);
      const toast = await (0, import_api2.showToast)({
        style: import_api2.Toast.Style.Failure,
        title: userError.title,
        message: userError.message
      });
      if (userError.openPreferences) {
        toast.primaryAction = {
          title: "Open Preferences",
          onAction: () => (0, import_api2.openExtensionPreferences)()
        };
      }
    } finally {
      setIsSubmitting(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    import_api2.Form,
    {
      isLoading: isSubmitting,
      actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_api2.ActionPanel, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.Action.SubmitForm, { title: "Create Task", onSubmit: handleSubmit }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_api2.Action,
          {
            title: "Open Extension Preferences",
            onAction: import_api2.openExtensionPreferences
          }
        )
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_api2.Form.TextField,
          {
            id: "title",
            title: "Title",
            placeholder: "What needs to get done?",
            value: title,
            onChange: setTitle,
            autoFocus: true
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_api2.Form.TextArea,
          {
            id: "notes",
            title: "Notes",
            placeholder: "Optional notes",
            value: notes,
            onChange: setNotes
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_api2.Form.Checkbox,
          {
            id: "openAfterCreate",
            label: "Open task in Main Character after create",
            value: openAfterCreate,
            onChange: (nextValue) => {
              void persistOpenAfterCreate(nextValue).catch(() => void 0);
            }
          }
        )
      ]
    }
  );
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3F1aWNrLWFkZC10YXNrLnRzeCIsICIuLi9zcmMvYXBpL2NsaWVudC50cyIsICIuLi9zcmMvYXBpL3F1aWNrLWFkZC50cyIsICIuLi9zcmMvbGliL3ZhbGlkYXRpb24udHMiLCAiLi4vc3JjL2xpYi9wcmVmZXJlbmNlcy50cyIsICIuLi9zcmMvbGliL2Vycm9ycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHtcbiAgQWN0aW9uLFxuICBBY3Rpb25QYW5lbCxcbiAgRm9ybSxcbiAgTGF1bmNoUHJvcHMsXG4gIExvY2FsU3RvcmFnZSxcbiAgZ2V0U2VsZWN0ZWRUZXh0LFxuICBvcGVuLFxuICBvcGVuRXh0ZW5zaW9uUHJlZmVyZW5jZXMsXG4gIHNob3dUb2FzdCxcbiAgVG9hc3QsXG59IGZyb20gXCJAcmF5Y2FzdC9hcGlcIjtcbmltcG9ydCB7IHVzZUVmZmVjdCwgdXNlU3RhdGUgfSBmcm9tIFwicmVhY3RcIjtcbmltcG9ydCB7IGNyZWF0ZVF1aWNrQWRkVGFzayB9IGZyb20gXCIuL2FwaS9xdWljay1hZGRcIjtcbmltcG9ydCB7IHRvVXNlckZhY2luZ0Vycm9yIH0gZnJvbSBcIi4vbGliL2Vycm9yc1wiO1xuaW1wb3J0IHsgZ2V0UnVudGltZVByZWZlcmVuY2VzIH0gZnJvbSBcIi4vbGliL3ByZWZlcmVuY2VzXCI7XG5pbXBvcnQgeyBub3JtYWxpemVRdWlja0FkZElucHV0IH0gZnJvbSBcIi4vbGliL3ZhbGlkYXRpb25cIjtcblxudHlwZSBDb21tYW5kQXJndW1lbnRzID0ge1xuICB0aXRsZT86IHN0cmluZztcbn07XG5cbmNvbnN0IE9QRU5fQUZURVJfQ1JFQVRFX1NUT1JBR0VfS0VZID0gXCJxdWljay1hZGQtb3Blbi1hZnRlci1jcmVhdGVcIjtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gUXVpY2tBZGRUYXNrQ29tbWFuZChcbiAgcHJvcHM6IExhdW5jaFByb3BzPHsgYXJndW1lbnRzOiBDb21tYW5kQXJndW1lbnRzIH0+LFxuKSB7XG4gIGNvbnN0IFt0aXRsZSwgc2V0VGl0bGVdID0gdXNlU3RhdGUocHJvcHMuYXJndW1lbnRzLnRpdGxlPy50cmltKCkgPz8gXCJcIik7XG4gIGNvbnN0IFtub3Rlcywgc2V0Tm90ZXNdID0gdXNlU3RhdGUoXCJcIik7XG4gIGNvbnN0IFtpc1N1Ym1pdHRpbmcsIHNldElzU3VibWl0dGluZ10gPSB1c2VTdGF0ZShmYWxzZSk7XG4gIGNvbnN0IFtvcGVuQWZ0ZXJDcmVhdGUsIHNldE9wZW5BZnRlckNyZWF0ZV0gPSB1c2VTdGF0ZShmYWxzZSk7XG5cbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBsZXQgY2FuY2VsbGVkID0gZmFsc2U7XG5cbiAgICBMb2NhbFN0b3JhZ2UuZ2V0SXRlbTxzdHJpbmc+KE9QRU5fQUZURVJfQ1JFQVRFX1NUT1JBR0VfS0VZKVxuICAgICAgLnRoZW4oKHZhbHVlKSA9PiB7XG4gICAgICAgIGlmIChjYW5jZWxsZWQpIHJldHVybjtcbiAgICAgICAgc2V0T3BlbkFmdGVyQ3JlYXRlKHZhbHVlID09PSBcInRydWVcIik7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgY2FuY2VsbGVkID0gdHJ1ZTtcbiAgICB9O1xuICB9LCBbXSk7XG5cbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBsZXQgY2FuY2VsbGVkID0gZmFsc2U7XG5cbiAgICBpZiAodGl0bGUudHJpbSgpLmxlbmd0aCA+IDApIHJldHVybjtcblxuICAgIGdldFNlbGVjdGVkVGV4dCgpXG4gICAgICAudGhlbigoc2VsZWN0ZWRUZXh0KSA9PiB7XG4gICAgICAgIGlmIChjYW5jZWxsZWQpIHJldHVybjtcbiAgICAgICAgY29uc3QgbmV4dFRpdGxlID0gc2VsZWN0ZWRUZXh0LnRyaW0oKTtcbiAgICAgICAgaWYgKG5leHRUaXRsZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgc2V0VGl0bGUobmV4dFRpdGxlKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIGNhbmNlbGxlZCA9IHRydWU7XG4gICAgfTtcbiAgfSwgW3RpdGxlXSk7XG5cbiAgYXN5bmMgZnVuY3Rpb24gcGVyc2lzdE9wZW5BZnRlckNyZWF0ZShuZXh0VmFsdWU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBzZXRPcGVuQWZ0ZXJDcmVhdGUobmV4dFZhbHVlKTtcbiAgICBhd2FpdCBMb2NhbFN0b3JhZ2Uuc2V0SXRlbShPUEVOX0FGVEVSX0NSRUFURV9TVE9SQUdFX0tFWSwgU3RyaW5nKG5leHRWYWx1ZSkpO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gaGFuZGxlU3VibWl0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHNldElzU3VibWl0dGluZyh0cnVlKTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBwcmVmcyA9IGdldFJ1bnRpbWVQcmVmZXJlbmNlcygpO1xuICAgICAgY29uc3Qgbm9ybWFsaXplZElucHV0ID0gbm9ybWFsaXplUXVpY2tBZGRJbnB1dCh7IHRpdGxlLCBub3RlcyB9KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNyZWF0ZVF1aWNrQWRkVGFzayhwcmVmcywge1xuICAgICAgICAuLi5ub3JtYWxpemVkSW5wdXQsXG4gICAgICAgIGlkZW1wb3RlbmN5S2V5OiBjcnlwdG8ucmFuZG9tVVVJRCgpLFxuICAgICAgICBzb3VyY2U6IFwicmF5Y2FzdF9leHRlbnNpb25cIixcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCB0YXNrVXJsID1cbiAgICAgICAgcmVzdWx0LnRhc2sudXJsID8/XG4gICAgICAgIGAke3ByZWZzLmJhc2VVcmx9L2FwcC90YXNrcz90YXNrSWQ9JHtlbmNvZGVVUklDb21wb25lbnQocmVzdWx0LnRhc2suaWQpfWA7XG5cbiAgICAgIGlmIChvcGVuQWZ0ZXJDcmVhdGUpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCBvcGVuKHRhc2tVcmwpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICBhd2FpdCBzaG93VG9hc3Qoe1xuICAgICAgICAgICAgc3R5bGU6IFRvYXN0LlN0eWxlLlN1Y2Nlc3MsXG4gICAgICAgICAgICB0aXRsZTogXCJUYXNrIGNyZWF0ZWRcIixcbiAgICAgICAgICAgIG1lc3NhZ2U6IFwiQ291bGRuXHUyMDE5dCBvcGVuIGJyb3dzZXIgYXV0b21hdGljYWxseS5cIixcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgdG9hc3QgPSBhd2FpdCBzaG93VG9hc3Qoe1xuICAgICAgICAgIHN0eWxlOiBUb2FzdC5TdHlsZS5TdWNjZXNzLFxuICAgICAgICAgIHRpdGxlOiBcIlRhc2sgY3JlYXRlZFwiLFxuICAgICAgICB9KTtcblxuICAgICAgICB0b2FzdC5wcmltYXJ5QWN0aW9uID0ge1xuICAgICAgICAgIHRpdGxlOiBcIkdvIHRvIFRhc2tcIixcbiAgICAgICAgICBvbkFjdGlvbjogKCkgPT4gb3Blbih0YXNrVXJsKSxcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgc2V0VGl0bGUoXCJcIik7XG4gICAgICBzZXROb3RlcyhcIlwiKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgdXNlckVycm9yID0gdG9Vc2VyRmFjaW5nRXJyb3IoZXJyb3IpO1xuICAgICAgY29uc3QgdG9hc3QgPSBhd2FpdCBzaG93VG9hc3Qoe1xuICAgICAgICBzdHlsZTogVG9hc3QuU3R5bGUuRmFpbHVyZSxcbiAgICAgICAgdGl0bGU6IHVzZXJFcnJvci50aXRsZSxcbiAgICAgICAgbWVzc2FnZTogdXNlckVycm9yLm1lc3NhZ2UsXG4gICAgICB9KTtcblxuICAgICAgaWYgKHVzZXJFcnJvci5vcGVuUHJlZmVyZW5jZXMpIHtcbiAgICAgICAgdG9hc3QucHJpbWFyeUFjdGlvbiA9IHtcbiAgICAgICAgICB0aXRsZTogXCJPcGVuIFByZWZlcmVuY2VzXCIsXG4gICAgICAgICAgb25BY3Rpb246ICgpID0+IG9wZW5FeHRlbnNpb25QcmVmZXJlbmNlcygpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICBzZXRJc1N1Ym1pdHRpbmcoZmFsc2UpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiAoXG4gICAgPEZvcm1cbiAgICAgIGlzTG9hZGluZz17aXNTdWJtaXR0aW5nfVxuICAgICAgYWN0aW9ucz17XG4gICAgICAgIDxBY3Rpb25QYW5lbD5cbiAgICAgICAgICA8QWN0aW9uLlN1Ym1pdEZvcm0gdGl0bGU9XCJDcmVhdGUgVGFza1wiIG9uU3VibWl0PXtoYW5kbGVTdWJtaXR9IC8+XG4gICAgICAgICAgPEFjdGlvblxuICAgICAgICAgICAgdGl0bGU9XCJPcGVuIEV4dGVuc2lvbiBQcmVmZXJlbmNlc1wiXG4gICAgICAgICAgICBvbkFjdGlvbj17b3BlbkV4dGVuc2lvblByZWZlcmVuY2VzfVxuICAgICAgICAgIC8+XG4gICAgICAgIDwvQWN0aW9uUGFuZWw+XG4gICAgICB9XG4gICAgPlxuICAgICAgPEZvcm0uVGV4dEZpZWxkXG4gICAgICAgIGlkPVwidGl0bGVcIlxuICAgICAgICB0aXRsZT1cIlRpdGxlXCJcbiAgICAgICAgcGxhY2Vob2xkZXI9XCJXaGF0IG5lZWRzIHRvIGdldCBkb25lP1wiXG4gICAgICAgIHZhbHVlPXt0aXRsZX1cbiAgICAgICAgb25DaGFuZ2U9e3NldFRpdGxlfVxuICAgICAgICBhdXRvRm9jdXNcbiAgICAgIC8+XG4gICAgICA8Rm9ybS5UZXh0QXJlYVxuICAgICAgICBpZD1cIm5vdGVzXCJcbiAgICAgICAgdGl0bGU9XCJOb3Rlc1wiXG4gICAgICAgIHBsYWNlaG9sZGVyPVwiT3B0aW9uYWwgbm90ZXNcIlxuICAgICAgICB2YWx1ZT17bm90ZXN9XG4gICAgICAgIG9uQ2hhbmdlPXtzZXROb3Rlc31cbiAgICAgIC8+XG4gICAgICA8Rm9ybS5DaGVja2JveFxuICAgICAgICBpZD1cIm9wZW5BZnRlckNyZWF0ZVwiXG4gICAgICAgIGxhYmVsPVwiT3BlbiB0YXNrIGluIE1haW4gQ2hhcmFjdGVyIGFmdGVyIGNyZWF0ZVwiXG4gICAgICAgIHZhbHVlPXtvcGVuQWZ0ZXJDcmVhdGV9XG4gICAgICAgIG9uQ2hhbmdlPXsobmV4dFZhbHVlKSA9PiB7XG4gICAgICAgICAgdm9pZCBwZXJzaXN0T3BlbkFmdGVyQ3JlYXRlKG5leHRWYWx1ZSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcbiAgICAgICAgfX1cbiAgICAgIC8+XG4gICAgPC9Gb3JtPlxuICApO1xufVxuIiwgImNvbnN0IFJFUVVFU1RfVElNRU9VVF9NUyA9IDhfMDAwO1xuY29uc3QgTUFYX0FUVEVNUFRTID0gMjtcbmNvbnN0IFJFVFJZX0JBQ0tPRkZfTVMgPSAyMDA7XG5cbmV4cG9ydCB0eXBlIEFwaUNsaWVudENvbmZpZyA9IHtcbiAgYmFzZVVybDogc3RyaW5nO1xuICBwZXJzb25hbEFjY2Vzc1Rva2VuOiBzdHJpbmc7XG59O1xuXG5leHBvcnQgdHlwZSBBcGlFcnJvclBheWxvYWQgPSB7XG4gIG9rPzogYm9vbGVhbjtcbiAgY29kZT86IHN0cmluZztcbiAgZXJyb3I/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgY2xhc3MgQXBpRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIHJlYWRvbmx5IHN0YXR1czogbnVtYmVyO1xuICByZWFkb25seSBjb2RlOiBzdHJpbmcgfCBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKHBhcmFtczoge1xuICAgIHN0YXR1czogbnVtYmVyO1xuICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgICBjb2RlPzogc3RyaW5nIHwgbnVsbDtcbiAgfSkge1xuICAgIHN1cGVyKHBhcmFtcy5tZXNzYWdlKTtcbiAgICB0aGlzLm5hbWUgPSBcIkFwaUVycm9yXCI7XG4gICAgdGhpcy5zdGF0dXMgPSBwYXJhbXMuc3RhdHVzO1xuICAgIHRoaXMuY29kZSA9IHBhcmFtcy5jb2RlID8/IG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE5ldHdvcmtFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgcmVhZG9ubHkga2luZDogXCJ0aW1lb3V0XCIgfCBcIm5ldHdvcmtcIjtcblxuICBjb25zdHJ1Y3RvcihraW5kOiBcInRpbWVvdXRcIiB8IFwibmV0d29ya1wiLCBtZXNzYWdlOiBzdHJpbmcpIHtcbiAgICBzdXBlcihtZXNzYWdlKTtcbiAgICB0aGlzLm5hbWUgPSBcIk5ldHdvcmtFcnJvclwiO1xuICAgIHRoaXMua2luZCA9IGtpbmQ7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2xlZXAobXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGlzUmV0cmlhYmxlQXBpU3RhdHVzKHN0YXR1czogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0dXMgPT09IDQyOSB8fCBzdGF0dXMgPj0gNTAwO1xufVxuXG5mdW5jdGlvbiBpc1JldHJpYWJsZUVycm9yKGVycm9yOiB1bmtub3duKTogYm9vbGVhbiB7XG4gIGlmIChlcnJvciBpbnN0YW5jZW9mIE5ldHdvcmtFcnJvcikgcmV0dXJuIHRydWU7XG4gIGlmIChlcnJvciBpbnN0YW5jZW9mIEFwaUVycm9yKSByZXR1cm4gaXNSZXRyaWFibGVBcGlTdGF0dXMoZXJyb3Iuc3RhdHVzKTtcbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5hc3luYyBmdW5jdGlvbiBwYXJzZUpzb25TYWZlbHkocmVzcG9uc2U6IFJlc3BvbnNlKTogUHJvbWlzZTx1bmtub3duPiB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hXaXRoVGltZW91dChcbiAgdXJsOiBzdHJpbmcsXG4gIGluaXQ6IFJlcXVlc3RJbml0LFxuICB0aW1lb3V0TXM6IG51bWJlcixcbik6IFByb21pc2U8UmVzcG9uc2U+IHtcbiAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgY29uc3QgdGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIHRpbWVvdXRNcyk7XG5cbiAgdHJ5IHtcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2godXJsLCB7XG4gICAgICAuLi5pbml0LFxuICAgICAgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5uYW1lID09PSBcIkFib3J0RXJyb3JcIikge1xuICAgICAgdGhyb3cgbmV3IE5ldHdvcmtFcnJvcihcbiAgICAgICAgXCJ0aW1lb3V0XCIsXG4gICAgICAgIFwiQ291bGRuXHUyMDE5dCByZWFjaCBNYWluIENoYXJhY3Rlci4gVHJ5IGFnYWluLlwiLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgTmV0d29ya0Vycm9yKFwibmV0d29ya1wiLCBcIkNvdWxkblx1MjAxOXQgcmVhY2ggTWFpbiBDaGFyYWN0ZXIuIFRyeSBhZ2Fpbi5cIik7XG4gIH0gZmluYWxseSB7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBvc3RKc29uPFRSZXNwb25zZT4ocGFyYW1zOiB7XG4gIGNvbmZpZzogQXBpQ2xpZW50Q29uZmlnO1xuICBwYXRoOiBzdHJpbmc7XG4gIGJvZHk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xufSk6IFByb21pc2U8VFJlc3BvbnNlPiB7XG4gIGNvbnN0IGVuZHBvaW50ID0gbmV3IFVSTChwYXJhbXMucGF0aCwgcGFyYW1zLmNvbmZpZy5iYXNlVXJsKS50b1N0cmluZygpO1xuXG4gIGZvciAobGV0IGF0dGVtcHQgPSAxOyBhdHRlbXB0IDw9IE1BWF9BVFRFTVBUUzsgYXR0ZW1wdCArPSAxKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2hXaXRoVGltZW91dChcbiAgICAgICAgZW5kcG9pbnQsXG4gICAgICAgIHtcbiAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtwYXJhbXMuY29uZmlnLnBlcnNvbmFsQWNjZXNzVG9rZW59YCxcbiAgICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGFyYW1zLmJvZHkpLFxuICAgICAgICB9LFxuICAgICAgICBSRVFVRVNUX1RJTUVPVVRfTVMsXG4gICAgICApO1xuXG4gICAgICBjb25zdCBwYXlsb2FkID0gKGF3YWl0IHBhcnNlSnNvblNhZmVseShyZXNwb25zZSkpIGFzIEFwaUVycm9yUGF5bG9hZCB8IFRSZXNwb25zZSB8IG51bGw7XG5cbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgY29uc3QgYXBpRXJyb3JQYXlsb2FkID0gKHBheWxvYWQgPz8gbnVsbCkgYXMgQXBpRXJyb3JQYXlsb2FkIHwgbnVsbDtcbiAgICAgICAgdGhyb3cgbmV3IEFwaUVycm9yKHtcbiAgICAgICAgICBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcbiAgICAgICAgICBjb2RlOiBhcGlFcnJvclBheWxvYWQ/LmNvZGUgPz8gbnVsbCxcbiAgICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgICAgYXBpRXJyb3JQYXlsb2FkPy5lcnJvcj8udHJpbSgpIHx8XG4gICAgICAgICAgICBgUmVxdWVzdCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwYXlsb2FkIGFzIFRSZXNwb25zZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGF0dGVtcHQgPj0gTUFYX0FUVEVNUFRTIHx8ICFpc1JldHJpYWJsZUVycm9yKGVycm9yKSkge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHNsZWVwKFJFVFJZX0JBQ0tPRkZfTVMpO1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBFcnJvcihcIlVuZXhwZWN0ZWQgcmVxdWVzdCBmYWlsdXJlXCIpO1xufVxuIiwgImltcG9ydCB7IHBvc3RKc29uLCB0eXBlIEFwaUNsaWVudENvbmZpZyB9IGZyb20gXCIuL2NsaWVudFwiO1xuXG5leHBvcnQgdHlwZSBRdWlja0FkZFJlcXVlc3QgPSB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIG5vdGVzPzogc3RyaW5nO1xuICBzb3VyY2U6IFwicmF5Y2FzdF9leHRlbnNpb25cIjtcbiAgaWRlbXBvdGVuY3lLZXk6IHN0cmluZztcbn07XG5cbmV4cG9ydCB0eXBlIFF1aWNrQWRkU3VjY2Vzc1Jlc3BvbnNlID0ge1xuICBvazogdHJ1ZTtcbiAgdGFzazoge1xuICAgIGlkOiBzdHJpbmc7XG4gICAgdGl0bGU6IHN0cmluZztcbiAgICB1cmw/OiBzdHJpbmc7XG4gIH07XG4gIHJlcXVlc3RJZDogc3RyaW5nO1xufTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVF1aWNrQWRkVGFzayhcbiAgY29uZmlnOiBBcGlDbGllbnRDb25maWcsXG4gIHJlcXVlc3Q6IFF1aWNrQWRkUmVxdWVzdCxcbik6IFByb21pc2U8UXVpY2tBZGRTdWNjZXNzUmVzcG9uc2U+IHtcbiAgcmV0dXJuIHBvc3RKc29uPFF1aWNrQWRkU3VjY2Vzc1Jlc3BvbnNlPih7XG4gICAgY29uZmlnLFxuICAgIHBhdGg6IFwiL2FwaS90YXNrcy9xdWljay1hZGRcIixcbiAgICBib2R5OiByZXF1ZXN0LFxuICB9KTtcbn1cbiIsICJleHBvcnQgY2xhc3MgRm9ybVZhbGlkYXRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nKSB7XG4gICAgc3VwZXIobWVzc2FnZSk7XG4gICAgdGhpcy5uYW1lID0gXCJGb3JtVmFsaWRhdGlvbkVycm9yXCI7XG4gIH1cbn1cblxuZXhwb3J0IHR5cGUgUXVpY2tBZGRGb3JtSW5wdXQgPSB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIG5vdGVzOiBzdHJpbmc7XG59O1xuXG5leHBvcnQgdHlwZSBOb3JtYWxpemVkUXVpY2tBZGRJbnB1dCA9IHtcbiAgdGl0bGU6IHN0cmluZztcbiAgbm90ZXM/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplUXVpY2tBZGRJbnB1dChcbiAgaW5wdXQ6IFF1aWNrQWRkRm9ybUlucHV0LFxuKTogTm9ybWFsaXplZFF1aWNrQWRkSW5wdXQge1xuICBjb25zdCB0aXRsZSA9IGlucHV0LnRpdGxlLnRyaW0oKTtcbiAgaWYgKHRpdGxlLmxlbmd0aCA9PT0gMCkge1xuICAgIHRocm93IG5ldyBGb3JtVmFsaWRhdGlvbkVycm9yKFwiVGl0bGUgaXMgcmVxdWlyZWQuXCIpO1xuICB9XG5cbiAgY29uc3Qgbm90ZXMgPSBpbnB1dC5ub3Rlcy50cmltKCk7XG5cbiAgcmV0dXJuIHtcbiAgICB0aXRsZSxcbiAgICAuLi4obm90ZXMubGVuZ3RoID4gMCA/IHsgbm90ZXMgfSA6IHt9KSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyBnZXRQcmVmZXJlbmNlVmFsdWVzIH0gZnJvbSBcIkByYXljYXN0L2FwaVwiO1xuXG50eXBlIEV4dGVuc2lvblByZWZlcmVuY2VzID0ge1xuICBiYXNlVXJsOiBzdHJpbmc7XG4gIHBlcnNvbmFsQWNjZXNzVG9rZW46IHN0cmluZztcbn07XG5cbmV4cG9ydCBjbGFzcyBQcmVmZXJlbmNlRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIHJlYWRvbmx5IHByZWZlcmVuY2VOYW1lOiBcImJhc2VVcmxcIiB8IFwicGVyc29uYWxBY2Nlc3NUb2tlblwiO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByZWZlcmVuY2VOYW1lOiBcImJhc2VVcmxcIiB8IFwicGVyc29uYWxBY2Nlc3NUb2tlblwiLFxuICAgIG1lc3NhZ2U6IHN0cmluZyxcbiAgKSB7XG4gICAgc3VwZXIobWVzc2FnZSk7XG4gICAgdGhpcy5uYW1lID0gXCJQcmVmZXJlbmNlRXJyb3JcIjtcbiAgICB0aGlzLnByZWZlcmVuY2VOYW1lID0gcHJlZmVyZW5jZU5hbWU7XG4gIH1cbn1cblxuZXhwb3J0IHR5cGUgUnVudGltZVByZWZlcmVuY2VzID0ge1xuICBiYXNlVXJsOiBzdHJpbmc7XG4gIHBlcnNvbmFsQWNjZXNzVG9rZW46IHN0cmluZztcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSdW50aW1lUHJlZmVyZW5jZXMoKTogUnVudGltZVByZWZlcmVuY2VzIHtcbiAgY29uc3QgcHJlZnMgPSBnZXRQcmVmZXJlbmNlVmFsdWVzPEV4dGVuc2lvblByZWZlcmVuY2VzPigpO1xuICBjb25zdCBiYXNlVXJsID0gcHJlZnMuYmFzZVVybD8udHJpbSgpO1xuICBjb25zdCBwZXJzb25hbEFjY2Vzc1Rva2VuID0gcHJlZnMucGVyc29uYWxBY2Nlc3NUb2tlbj8udHJpbSgpO1xuXG4gIGlmICghYmFzZVVybCkge1xuICAgIHRocm93IG5ldyBQcmVmZXJlbmNlRXJyb3IoXCJiYXNlVXJsXCIsIFwiU2V0IEFQSSBCYXNlIFVSTCBpbiBleHRlbnNpb24gcHJlZmVyZW5jZXMuXCIpO1xuICB9XG5cbiAgbGV0IG5vcm1hbGl6ZWRCYXNlVXJsOiBVUkw7XG4gIHRyeSB7XG4gICAgbm9ybWFsaXplZEJhc2VVcmwgPSBuZXcgVVJMKGJhc2VVcmwpO1xuICB9IGNhdGNoIHtcbiAgICB0aHJvdyBuZXcgUHJlZmVyZW5jZUVycm9yKFwiYmFzZVVybFwiLCBcIkFQSSBCYXNlIFVSTCBtdXN0IGJlIGEgdmFsaWQgYWJzb2x1dGUgVVJMLlwiKTtcbiAgfVxuXG4gIGlmICghcGVyc29uYWxBY2Nlc3NUb2tlbikge1xuICAgIHRocm93IG5ldyBQcmVmZXJlbmNlRXJyb3IoXG4gICAgICBcInBlcnNvbmFsQWNjZXNzVG9rZW5cIixcbiAgICAgIFwiU2V0IFBlcnNvbmFsIEFjY2VzcyBUb2tlbiBpbiBleHRlbnNpb24gcHJlZmVyZW5jZXMuXCIsXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmFzZVVybDogbm9ybWFsaXplZEJhc2VVcmwub3JpZ2luLFxuICAgIHBlcnNvbmFsQWNjZXNzVG9rZW4sXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgQXBpRXJyb3IsIE5ldHdvcmtFcnJvciB9IGZyb20gXCIuLi9hcGkvY2xpZW50XCI7XG5pbXBvcnQgeyBGb3JtVmFsaWRhdGlvbkVycm9yIH0gZnJvbSBcIi4vdmFsaWRhdGlvblwiO1xuaW1wb3J0IHsgUHJlZmVyZW5jZUVycm9yIH0gZnJvbSBcIi4vcHJlZmVyZW5jZXNcIjtcblxuZXhwb3J0IHR5cGUgVXNlckZhY2luZ0Vycm9yID0ge1xuICB0aXRsZTogc3RyaW5nO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIG9wZW5QcmVmZXJlbmNlcz86IGJvb2xlYW47XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gdG9Vc2VyRmFjaW5nRXJyb3IoZXJyb3I6IHVua25vd24pOiBVc2VyRmFjaW5nRXJyb3Ige1xuICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQcmVmZXJlbmNlRXJyb3IpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdGl0bGU6IFwiU2V0dXAgUmVxdWlyZWRcIixcbiAgICAgIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG4gICAgICBvcGVuUHJlZmVyZW5jZXM6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIGlmIChlcnJvciBpbnN0YW5jZW9mIEZvcm1WYWxpZGF0aW9uRXJyb3IpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdGl0bGU6IFwiQ2FuXHUyMDE5dCBDcmVhdGUgVGFza1wiLFxuICAgICAgbWVzc2FnZTogZXJyb3IubWVzc2FnZSxcbiAgICB9O1xuICB9XG5cbiAgaWYgKGVycm9yIGluc3RhbmNlb2YgTmV0d29ya0Vycm9yKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHRpdGxlOiBcIkNvdWxkblx1MjAxOXQgQ3JlYXRlIFRhc2tcIixcbiAgICAgIG1lc3NhZ2U6IFwiQ291bGRuXHUyMDE5dCByZWFjaCBNYWluIENoYXJhY3Rlci4gVHJ5IGFnYWluLlwiLFxuICAgIH07XG4gIH1cblxuICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBBcGlFcnJvcikge1xuICAgIGlmIChlcnJvci5zdGF0dXMgPT09IDQwMSB8fCBlcnJvci5zdGF0dXMgPT09IDQwMykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdGl0bGU6IFwiQXV0aGVudGljYXRpb24gRmFpbGVkXCIsXG4gICAgICAgIG1lc3NhZ2U6IFwiVG9rZW4gaW52YWxpZCwgcmV2b2tlZCwgZXhwaXJlZCwgb3IgbWlzc2luZyByZXF1aXJlZCBzY29wZS5cIixcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKGVycm9yLnN0YXR1cyA9PT0gNDI5KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB0aXRsZTogXCJSYXRlIExpbWl0ZWRcIixcbiAgICAgICAgbWVzc2FnZTogXCJUb28gbWFueSByZXF1ZXN0cy4gV2FpdCBhIG1vbWVudCBhbmQgdHJ5IGFnYWluLlwiLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoZXJyb3Iuc3RhdHVzID09PSA0MDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHRpdGxlOiBcIkludmFsaWQgVGFza1wiLFxuICAgICAgICBtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgdGl0bGU6IFwiQ291bGRuXHUyMDE5dCBDcmVhdGUgVGFza1wiLFxuICAgICAgbWVzc2FnZTogZXJyb3IubWVzc2FnZSxcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICB0aXRsZTogXCJDb3VsZG5cdTIwMTl0IENyZWF0ZSBUYXNrXCIsXG4gICAgbWVzc2FnZTogXCJVbmV4cGVjdGVkIGVycm9yLiBUcnkgYWdhaW4uXCIsXG4gIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUFBQSxjQVdPO0FBQ1AsbUJBQW9DOzs7QUNacEMsSUFBTSxxQkFBcUI7QUFDM0IsSUFBTSxlQUFlO0FBQ3JCLElBQU0sbUJBQW1CO0FBYWxCLElBQU0sV0FBTixjQUF1QixNQUFNO0FBQUEsRUFDekI7QUFBQSxFQUNBO0FBQUEsRUFFVCxZQUFZLFFBSVQ7QUFDRCxVQUFNLE9BQU8sT0FBTztBQUNwQixTQUFLLE9BQU87QUFDWixTQUFLLFNBQVMsT0FBTztBQUNyQixTQUFLLE9BQU8sT0FBTyxRQUFRO0FBQUEsRUFDN0I7QUFDRjtBQUVPLElBQU0sZUFBTixjQUEyQixNQUFNO0FBQUEsRUFDN0I7QUFBQSxFQUVULFlBQVksTUFBNkIsU0FBaUI7QUFDeEQsVUFBTSxPQUFPO0FBQ2IsU0FBSyxPQUFPO0FBQ1osU0FBSyxPQUFPO0FBQUEsRUFDZDtBQUNGO0FBRUEsU0FBUyxNQUFNLElBQTJCO0FBQ3hDLFNBQU8sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUM5QixlQUFXLFNBQVMsRUFBRTtBQUFBLEVBQ3hCLENBQUM7QUFDSDtBQUVBLFNBQVMscUJBQXFCLFFBQXlCO0FBQ3JELFNBQU8sV0FBVyxPQUFPLFVBQVU7QUFDckM7QUFFQSxTQUFTLGlCQUFpQixPQUF5QjtBQUNqRCxNQUFJLGlCQUFpQixhQUFjLFFBQU87QUFDMUMsTUFBSSxpQkFBaUIsU0FBVSxRQUFPLHFCQUFxQixNQUFNLE1BQU07QUFDdkUsU0FBTztBQUNUO0FBRUEsZUFBZSxnQkFBZ0IsVUFBc0M7QUFDbkUsTUFBSTtBQUNGLFdBQU8sTUFBTSxTQUFTLEtBQUs7QUFBQSxFQUM3QixRQUFRO0FBQ04sV0FBTztBQUFBLEVBQ1Q7QUFDRjtBQUVBLGVBQWUsaUJBQ2Is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
