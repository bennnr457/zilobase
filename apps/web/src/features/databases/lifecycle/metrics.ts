import {
  databaseMetric,
  type DatabaseMetric,
  type DatabaseMetricName,
  type DatabaseMetricReason,
} from "@zilobase/features/databases";

export function emitDatabaseMetric(
  name: DatabaseMetricName,
  value: number,
  outcome: DatabaseMetric["outcome"] = "success",
  reason?: DatabaseMetricReason,
) {
  const metric = databaseMetric(name, value, outcome, reason);
  if (metric && typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(
      new CustomEvent("zilobase:database:metric", {
        detail: metric,
      }),
    );
  }
  return metric;
}
