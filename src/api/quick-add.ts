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

export async function createQuickAddTask(
  config: ApiClientConfig,
  request: QuickAddRequest,
): Promise<QuickAddSuccessResponse> {
  return postJson<QuickAddSuccessResponse>({
    config,
    path: "/api/tasks/quick-add",
    body: request,
  });
}
