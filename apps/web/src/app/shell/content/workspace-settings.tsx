import { WorkspaceMcpPolicyPanel } from "@/features/ai/settings/components/workspace-mcp-policy";
import { WorkspaceSettingsPage } from "@/features/workspaces";
import { isFeatureEnabled } from "@/shared/config/feature-flags";

export default function WorkspaceSettings() {
  return (
    <WorkspaceSettingsPage
      policySettings={isFeatureEnabled("askAi") ? <WorkspaceMcpPolicyPanel /> : null}
    />
  );
}
