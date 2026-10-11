import { usePageNavigation } from "@zilobase/features/pages/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import {
  settingsFieldTab,
  type AgentSettingsReview,
  type AgentSettingsTab,
  type AgentSettingsDefinition,
} from "@zilobase/features/ai-chat";

const labels: Partial<Record<keyof AgentSettingsDefinition, string>> = {
  name: "Agent title",
  description: "Agent description",
  icon: "Agent icon",
  cover: "Agent cover",
  iconPosition: "Icon position",
  instructionTitle: "Instruction title",
  instructionPageId: "Instruction page",
  connectors: "Connectors",
};
function identity(value: Record<string, unknown>) {
  return String(value.connectionId ?? value.id ?? "");
}
export function SettingsReviewSummary({
  review,
  tab,
}: {
  review: AgentSettingsReview;
  tab: AgentSettingsTab;
}) {
  const workspaceId = useActiveWorkspaceId();
  const navigation = usePageNavigation(workspaceId);
  const itemName = (row: Record<string, unknown>) => (row.label ? String(row.label) : "Connection");
  const fields = review.fields.filter((field) => settingsFieldTab(field) === tab && labels[field]);
  return (
    <div className="mx-5 mt-4 grid gap-2 text-sm" aria-label="AI changes">
      {review.fields.some((field) => settingsFieldTab(field) === tab) && (
        <p className="text-xs text-content-secondary">
          AI changes are highlighted. Save to accept or Discard to reject.
        </p>
      )}
      {fields.map((field) => {
        const before = review.before[field];
        const after = review.after[field];
        if (Array.isArray(before) && Array.isArray(after)) {
          const oldRows = before as Record<string, unknown>[];
          const newRows = after as Record<string, unknown>[];
          const removed = oldRows.filter(
            (row) => !newRows.some((next) => identity(next) === identity(row)),
          );
          return (
            <div key={field} className="grid gap-2">
              {removed.length > 0 && (
                <div className="rounded-md bg-feedback-error-subtle p-2 text-feedback-error-text">
                  {labels[field]} removed: {removed.map(itemName).join(", ")}
                </div>
              )}
            </div>
          );
        }
        const display = (value: unknown) =>
          value == null || value === ""
            ? "Empty"
            : field === "cover"
              ? "Cover image"
              : field === "instructionPageId"
                ? navigation.data?.pages.find((page) => page.id === value)?.name ||
                  "Untitled instruction"
                : String(value);
        return (
          <div key={field} data-ai-changed="true" className="rounded-md p-2">
            <span className="mr-2 font-medium">{labels[field]}</span>
            <del className="mr-2 text-feedback-error-text">{display(before)}</del>
            <ins className="text-feedback-success-text no-underline">{display(after)}</ins>
          </div>
        );
      })}
    </div>
  );
}
