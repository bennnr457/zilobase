import { settingsActionsBusy, settingsProgressLabel } from "../model/draft-actions";
import { useNavigate } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { SettingsDraftActions } from "./settings-draft-actions";
import { SettingsReviewSummary } from "./settings-review-summary";
import { SavedInstructionPicker } from "./saved-instruction-picker";
import "../../agent-interface.css";
import { useSession } from "@zilobase/features/auth/react";
import * as React from "react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { type AgentSettingsTab, type AgentSettingsEvent } from "@zilobase/features/ai-chat";
import { PageEditorPane } from "@/features/pages/pane/page-editor-pane";
import { Button } from "@/shared/ui/button";
import { useSettingsDraft, isSettingsEditing } from "../use-settings-draft";

function ScopedAgentSettingsPage({
  scope = "personal",
  draft,
}: {
  draft: ReturnType<typeof useSettingsDraft>;
  scope?: string;
  initialTab?: string | null;
  onTabChange?: (tab: AgentSettingsTab) => void;
  onClose?: () => void;
}) {
  const [headerTarget, setHeaderTarget] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setHeaderTarget(document.getElementById("agent-settings-header-actions"));
  }, []);
  const [editorEpoch, setEditorEpoch] = React.useState(0);
  const [aiEditing, setAiEditing] = React.useState(() => isSettingsEditing(scope));
  React.useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<AgentSettingsEvent>).detail;
      if (detail.scope === scope) setAiEditing(detail.status === "editing");
    };
    window.addEventListener("agent-settings", listener);
    return () => window.removeEventListener("agent-settings", listener);
  }, [scope]);
  const navigate = useNavigate();
  const state = draft.state;
  const d = state?.definition;
  const review = draft.reviewOpen ? (state?.review ?? null) : null;
  const disabled = !state?.canEdit || settingsActionsBusy(draft);
  function renderSettingsHeader() {
    return (
      <header className="sticky top-0 z-20 grid min-w-0 shrink-0 gap-3 bg-surface-canvas dark:bg-surface-navigation px-5 py-3">
        {headerTarget ? (
          createPortal(<SettingsDraftActions draft={draft} />, headerTarget)
        ) : (
          <SettingsDraftActions draft={draft} />
        )}
        <div className="flex items-center gap-3 overflow-x-auto text-xs text-content-secondary">
          {state && <span className="shrink-0">Saved version {state.version}</span>}
          <span className="sr-only" aria-live="polite">
            {settingsProgressLabel(aiEditing, draft.syncing, Boolean(state))}
          </span>
          {d && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <SavedInstructionPicker
                disabled={disabled}
                onSelect={(page) => {
                  draft.patch({ instructionPageId: page.id });
                  setEditorEpoch((n) => n + 1);
                }}
              />
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                onClick={() => draft.createInstruction.mutate()}
              >
                {draft.createInstruction.isPending
                  ? "Creating instruction…"
                  : d.instructionPageId
                    ? "New instruction"
                    : "Create instruction"}
              </Button>
            </div>
          )}
        </div>
        {draft.error && (
          <p role="alert" className="text-sm text-feedback-danger-text">
            {draft.error}
          </p>
        )}
      </header>
    );
  }
  function renderInstructionPane() {
    if (!d?.instructionPageId) return null;
    return (
      <PageEditorPane
        key={`${d.instructionPageId}:${editorEpoch}`}
        pageId={d.instructionPageId}
        onOpenPage={(pageId) => void navigate({ to: "/p/$pageId", params: { pageId } })}
        readOnly={disabled}
        showCollaborationPresence
        className={
          review?.fields.includes("instructionTitle")
            ? "agent-instruction-title-changed"
            : undefined
        }
        reviewDiff={
          review &&
          draft.changedFields.some(
            (field) => field === "instructions" || field === "instructionDocument",
          )
            ? {
                beforeMarkdown: review.before.instructions,
                afterMarkdown: review.after.instructions,
              }
            : null
        }
      />
    );
  }

  return (
    <aside
      className="flex h-full min-h-0 min-w-0 flex-col overflow-x-clip bg-surface-canvas dark:bg-surface-navigation"
      data-agent-settings-page={scope}
    >
      {renderSettingsHeader()}
      <div className="min-h-0 flex-1 overflow-y-auto pb-12">
        {review && <SettingsReviewSummary review={review} tab="instructions" />}
        {d ? renderInstructionPane() : null}
      </div>
    </aside>
  );
}

type SettingsPageProps = Omit<React.ComponentProps<typeof ScopedAgentSettingsPage>, "draft"> & {
  draft?: ReturnType<typeof useSettingsDraft>;
};
function IndependentSettingsPage(props: Omit<SettingsPageProps, "draft">) {
  const draft = useSettingsDraft(props.scope ?? "personal");
  return <ScopedAgentSettingsPage {...props} draft={draft} />;
}
export function AgentSettingsPage(props: SettingsPageProps) {
  const workspaceId = useActiveWorkspaceId();
  const { data: session } = useSession();
  const key = `${workspaceId}:${session?.user?.id}:${props.scope ?? "personal"}`;
  return props.draft ? (
    <ScopedAgentSettingsPage key={key} {...props} draft={props.draft} />
  ) : (
    <IndependentSettingsPage key={key} {...props} />
  );
}
