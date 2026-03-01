import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, postJson } from "../src/api/client";

const TEST_CONFIG = {
  baseUrl: "https://maincharacter.game",
  personalAccessToken: "mc_pat_test",
};

test("postJson surfaces payload.message when payload.error is absent", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: "BAD_REQUEST", message: "Detailed failure" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  try {
    await assert.rejects(
      () =>
        postJson({
          config: TEST_CONFIG,
          path: "/api/tasks/quick-add",
          body: { title: "x" },
        }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.message, "Detailed failure");
        assert.equal(error.status, 400);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
