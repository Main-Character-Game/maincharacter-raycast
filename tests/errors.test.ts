import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/api/client";
import { toUserFacingError } from "../src/lib/errors";

test("toUserFacingError maps HTTP 422 to Invalid Task", () => {
  const mapped = toUserFacingError(
    new ApiError({ status: 422, message: "Title is required." }),
  );

  assert.equal(mapped.title, "Invalid Task");
  assert.equal(mapped.message, "Title is required.");
});

test("toUserFacingError preserves unknown runtime error messages", () => {
  const mapped = toUserFacingError(new Error("Main Character rejected this request."));

  assert.equal(mapped.title, "Couldn’t Create Task");
  assert.equal(mapped.message, "Main Character rejected this request.");
});

test("toUserFacingError keeps server auth message and opens preferences", () => {
  const mapped = toUserFacingError(
    new ApiError({ status: 403, message: "Missing required scope: TASK_CREATE" }),
  );

  assert.equal(mapped.title, "Authentication Failed");
  assert.equal(mapped.message, "Missing required scope: TASK_CREATE");
  assert.equal(mapped.openPreferences, true);
});

test("toUserFacingError falls back safely when auth ApiError message is missing", () => {
  const error = new ApiError({ status: 403, message: "" });
  (error as unknown as { message?: unknown }).message = undefined;

  const mapped = toUserFacingError(error);

  assert.equal(mapped.title, "Authentication Failed");
  assert.equal(
    mapped.message,
    "Token invalid, revoked, expired, or missing required scope.",
  );
  assert.equal(mapped.openPreferences, true);
});
