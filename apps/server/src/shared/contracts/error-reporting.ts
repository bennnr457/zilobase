import type { AppBindings } from "./http";
export type AppErrorReport = {
  code: string;
  error: Error;
  method: string;
  requestId: string;
  route: string;
  status: 500 | 503;
  userId: string | null;
  workspaceId: string | null;
};

export type AppErrorReporter = (
  report: AppErrorReport,
  env: AppBindings["Bindings"],
) => Promise<void> | void;
