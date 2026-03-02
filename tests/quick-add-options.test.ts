import assert from "node:assert/strict";
import test from "node:test";
import { parseQuickAddOptions } from "../src/api/quick-add-options";

test("parseQuickAddOptions accepts top-level payload", () => {
  const parsed = parseQuickAddOptions({
    ok: true,
    requestId: "req_opts",
    defaultColumnId: "col_1",
    columns: [
      { id: "col_1", name: "Inbox" },
      { id: "col_2", name: "Today" },
    ],
  });

  assert.equal(parsed.requestId, "req_opts");
  assert.equal(parsed.defaultColumnId, "col_1");
  assert.equal(parsed.columns.length, 2);
});

test("parseQuickAddOptions accepts nested data payload", () => {
  const parsed = parseQuickAddOptions({
    ok: true,
    data: {
      requestId: "req_nested",
      defaultColumnId: "col_1",
      columns: [{ id: "col_1", name: "Inbox" }],
    },
  });

  assert.equal(parsed.requestId, "req_nested");
  assert.equal(parsed.columns[0]?.id, "col_1");
});

test("parseQuickAddOptions rejects malformed payload", () => {
  assert.throws(() => parseQuickAddOptions({ ok: true, columns: [{}] }), {
    message: "Main Character returned an invalid columns payload.",
  });
});
