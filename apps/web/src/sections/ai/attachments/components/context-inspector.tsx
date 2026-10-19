import type { BuildContextResult } from "@zilobase/page-context";

export function ContextInspector({
  context,
  label = "Inspect context",
}: {
  context: BuildContextResult;
  label?: string;
}) {
  return (
    <details className="rounded-lg border p-2 text-xs">
      <summary className="cursor-pointer">
        {label} · {context.charCount.toLocaleString()} characters · {context.status}
      </summary>
      <ul className="my-2 space-y-1">
        {context.manifest
          .filter((entry) => entry.type === "source")
          .map((entry) => (
            <li key={entry.key}>
              {entry.title}: {entry.coverage?.includedRows ?? 0}/
              {entry.coverage?.totalRows ?? "unknown"} records
            </li>
          ))}
      </ul>
      {context.omissions.length > 0 && (
        <ul className="my-2 text-content-secondary">
          {context.omissions.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
      )}
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-secondary p-3">
        {context.markdown || context.omissions.join("\n")}
      </pre>
    </details>
  );
}
