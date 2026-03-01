import assert from "node:assert/strict";
import test from "node:test";
import { parseQuickAddSuccess } from "../src/api/quick-add";

test("parseQuickAddSuccess accepts top-level task payload", () => {
  const parsed = parseQuickAddSuccess({
    ok: true,
    requestId: "req_1",
    task: {
      id: "task_1",
      title: "Ship parser",
      url: "https://maincharacter.game/app/tasks?taskId=task_1",
    },
  });

  assert.equal(parsed.task.id, "task_1");
  assert.equal(parsed.requestId, "req_1");
});

test("parseQuickAddSuccess accepts nested data.task payload", () => {
  const parsed = parseQuickAddSuccess({
    ok: true,
    data: {
      requestId: "req_nested",
      task: {
        id: "task_nested",
        title: "Nested response",
      },
    },
  });

  assert.equal(parsed.task.id, "task_nested");
  assert.equal(parsed.task.title, "Nested response");
  assert.equal(parsed.requestId, "req_nested");
});

test("parseQuickAddSuccess rejects malformed success payload", () => {
  assert.throws(() => parseQuickAddSuccess({ ok: true }), {
    message: "Main Character returned success without a task payload.",
  });
});

test("parseQuickAddSuccess rejects ok:false payloads", () => {
  assert.throws(
    () => parseQuickAddSuccess({ ok: false, error: "Validation failed" }),
    { message: "Validation failed" },
  );
});
