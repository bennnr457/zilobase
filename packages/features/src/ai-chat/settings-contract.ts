import * as z from "zod";

export const settingsTabSchema = z.enum(["instructions", "connectors", "activity", "versions"]);
export type AgentSettingsTab = z.infer<typeof settingsTabSchema>;
export const settingsDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(500),
    icon: z.unknown().nullable(),
    cover: z.string().max(2_000_000).nullable(),
    iconPosition: z.enum(["inline", "top"]),
    instructions: z.string().max(200_000),
    instructionPageId: z.string().uuid().optional(),
    instructionTitle: z.string().max(200).optional(),
    instructionDocument: z.record(z.string(), z.unknown()),
    connectors: z
      .array(
        z.object({
          connectionId: z.string().min(1),
          alwaysAllowEnabled: z.boolean(),
          tools: z
            .array(
              z.object({
                toolId: z.string().min(1),
                enabled: z.boolean(),
                classification: z.enum(["read", "write", "unknown"]),
                executionMode: z.enum(["automatic", "always_ask"]),
              }),
            )
            .max(1000),
        }),
      )
      .max(100),
  })
  .strict();
export type AgentSettingsDefinition = z.infer<typeof settingsDefinitionSchema>;
// Linked page content autosaves independently of the agent configuration draft.
export function hasAgentConfigurationChanges(
  definition: AgentSettingsDefinition,
  saved: AgentSettingsDefinition,
): boolean {
  const linkedPageUnchanged =
    !!definition.instructionPageId && definition.instructionPageId === saved.instructionPageId;
  const configuration = (value: AgentSettingsDefinition) => {
    if (!linkedPageUnchanged) return value;
    const { instructionDocument, instructionTitle, instructions, ...settings } = value;
    return settings;
  };
  const current = configuration(definition);
  const baseline = configuration(saved);
  return (Object.keys(settingsDefinitionSchema.shape) as (keyof AgentSettingsDefinition)[]).some(
    (key) =>
      JSON.stringify(current[key as keyof typeof current]) !==
      JSON.stringify(baseline[key as keyof typeof baseline]),
  );
}
export const settingsReviewSchema = z.object({
  before: settingsDefinitionSchema,
  after: settingsDefinitionSchema,
  fields: z.array(settingsDefinitionSchema.keyof()),
});
export type AgentSettingsReview = z.infer<typeof settingsReviewSchema>;
export function mergeSettingsReview(
  previous: AgentSettingsReview | null | undefined,
  before: AgentSettingsDefinition,
  after: AgentSettingsDefinition,
  fields: (keyof AgentSettingsDefinition)[],
): AgentSettingsReview | null {
  const baseline = {
    ...before,
    ...Object.fromEntries((previous?.fields ?? []).map((key) => [key, previous!.before[key]])),
  } as AgentSettingsDefinition;
  const proposed = { ...previous?.after, ...after };
  const changed = [...new Set([...(previous?.fields ?? []), ...fields])].filter(
    (key) => JSON.stringify(baseline[key]) !== JSON.stringify(proposed[key]),
  );
  return changed.length ? { before: baseline, after: proposed, fields: changed } : null;
}
export function changedSettingsFields(
  state: AgentSettingsState,
): (keyof AgentSettingsDefinition)[] {
  const pageFields = ["instructions", "instructionDocument", "instructionTitle"];
  const samePage =
    !!state.definition.instructionPageId &&
    state.definition.instructionPageId === state.saved.instructionPageId;
  return [
    ...new Set([
      ...(Object.keys(settingsDefinitionSchema.shape) as (keyof AgentSettingsDefinition)[]).filter(
        (key) =>
          !(samePage && pageFields.includes(key)) &&
          JSON.stringify(state.definition[key]) !== JSON.stringify(state.saved[key]),
      ),
      ...(state.review?.fields ?? []),
    ]),
  ];
}
export function settingsFieldTab(field: keyof AgentSettingsDefinition): AgentSettingsTab {
  if (field === "connectors") return "connectors";
  return "instructions";
}
export type AgentSettingsState = {
  definition: AgentSettingsDefinition;
  saved: AgentSettingsDefinition;
  baseVersion: number;
  version: number;
  draftVersion: number;
  canEdit: boolean;
  pendingRun: string | null;
  review?: AgentSettingsReview | null;
};
export type AgentSettingsVersion = {
  id: string;
  version: number;
  definition: AgentSettingsDefinition;
  createdAt: string;
};
export type AgentSettingsEvent = {
  scope: string;
  tab: AgentSettingsTab;
  status: "editing" | "ready" | "failed";
  summary?: string;
};
export type ConnectorSetupRequest = { provider: string; scope: string };
export const settingsProposalSchema = z.object({
  tab: settingsTabSchema,
  summary: z.string().max(1000),
  patch: settingsDefinitionSchema.omit({ instructionDocument: true }).partial().strict(),
});
export function emptySettingsDefinition(): AgentSettingsDefinition {
  return {
    name: "Personal Ask AI",
    instructionTitle: "Instructions",
    description: "",
    icon: null,
    cover: null,
    iconPosition: "inline",
    instructions: "",
    instructionDocument: { type: "doc", content: [] },
    connectors: [],
  };
}
