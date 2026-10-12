export type DatabaseMetricName = "acknowledgement_latency" | "drag_to_paint" | "reset" | "rollback";

export type DatabaseMetricReason = "command_failure" | "manual";

export type DatabaseMetric = {
  event: `database.${DatabaseMetricName}`;
  outcome: "failure" | "success";
  reason?: DatabaseMetricReason;
  value: number;
};

export function databaseMetric(
  name: DatabaseMetricName,
  value: number,
  outcome: DatabaseMetric["outcome"] = "success",
  reason?: DatabaseMetricReason,
): DatabaseMetric | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return {
    event: `database.${name}`,
    outcome,
    ...(reason ? { reason } : {}),
    value: Math.round(value),
  };
}
