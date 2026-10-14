import type {
  AutomationFilterDefinition,
  AutomationNotificationRecipient,
  AutomationEditPagesTarget,
  AutomationPropertyOperation,
  AutomationRichTextExpression,
  DatabaseAutomationAction,
  DatabaseAutomationCatalog,
  AutomationJsonValue,
} from "./contracts";
import type { BuilderDraft } from "./definition-model";
export type ActionType = DatabaseAutomationAction["type"];

type WebhookHeaderDraft = {
  key: string;
  name: string;
  secretId: string;
  value: string;
};

export type NotionActionDraft = {
  action: DatabaseAutomationAction;
  webhookHeaders: WebhookHeaderDraft[];
};

export const NOTION_ACTION_OPTIONS: Array<{ label: string; type: ActionType }> = [
  { label: "Edit property", type: "edit_trigger_page" },
  { label: "Add page to", type: "add_page" },
  { label: "Edit pages in", type: "edit_pages" },
  { label: "Send notification to", type: "send_notification" },
  { label: "Send webhook", type: "send_webhook" },
  { label: "Send Slack notification to", type: "send_slack" },
  { label: "Define variables", type: "define_variables" },
];

export function notionActionLabel(type: ActionType) {
  return NOTION_ACTION_OPTIONS.find((item) => item.type === type)?.label ?? type;
}

export function createNotionActionDraft(
  type: ActionType = "edit_trigger_page",
  dataSourceId: string,
  catalog?: DatabaseAutomationCatalog,
): NotionActionDraft {
  const id = crypto.randomUUID();
  const firstUserId = catalog?.users[0]?.id ?? "";
  const firstSlackId =
    catalog?.slackConnections.find(({ status }) => status === "connected")?.id ?? "";
  const operation = defaultOperation();
  const action: DatabaseAutomationAction =
    type === "edit_trigger_page"
      ? { id, operations: [operation], type }
      : type === "add_page"
        ? { dataSourceId, id, operations: [], type }
        : type === "edit_pages"
          ? {
              id,
              operations: [operation],
              target: defaultFilteredTarget(dataSourceId, id),
              type,
            }
          : type === "send_notification"
            ? {
                id,
                message: textExpression(""),
                pageLink: { reference: "trigger_page", type: "reference" },
                recipients: [{ type: "selected_user", userId: firstUserId }],
                type,
              }
            : type === "send_webhook"
              ? {
                  headers: [],
                  id,
                  payloadFields: [],
                  selectedPropertyIds: [],
                  type,
                  url: "https://",
                }
              : type === "send_slack"
                ? {
                    channelId: "",
                    connectionId: firstSlackId,
                    id,
                    message: { parts: [{ text: "", type: "text" }] },
                    type,
                  }
                : {
                    id,
                    type: "define_variables",
                    variables: [{ expression: { type: "literal", value: "" }, name: "Variable 1" }],
                  };
  return { action, webhookHeaders: [] };
}

export function notionActionDraftFromAction(action: DatabaseAutomationAction): NotionActionDraft {
  return {
    action,
    webhookHeaders:
      action.type === "send_webhook"
        ? action.headers.map((header) => ({
            key: crypto.randomUUID(),
            name: header.name,
            secretId: header.secretId,
            value: "",
          }))
        : [],
  };
}

export function actionForDefinition(draft: NotionActionDraft): DatabaseAutomationAction {
  if (draft.action.type !== "send_webhook") return draft.action;
  return {
    ...draft.action,
    headers: draft.webhookHeaders.flatMap(({ name, secretId }) =>
      name.trim() && secretId ? [{ name: name.trim(), secretId }] : [],
    ),
  };
}

export function resolveWebhookHeader(
  draft: NotionActionDraft,
  key: string,
  secretId: string,
): NotionActionDraft {
  return {
    ...draft,
    webhookHeaders: draft.webhookHeaders.map((header) =>
      header.key === key ? { ...header, secretId, value: "" } : header,
    ),
  };
}

export function defaultOperation(propertyId = "name"): AutomationPropertyOperation {
  return { mode: "set", propertyId, value: { type: "literal", value: "" } };
}

export function defaultFilteredTarget(
  dataSourceId: string,
  actionId: string,
): Extract<AutomationEditPagesTarget, { type: "filtered_data_source" }> {
  return {
    dataSourceId,
    filter: {
      conditions: [
        {
          id: `${actionId}-filter-${crypto.randomUUID()}`,
          operator: "is_not_empty",
          propertyId: "name",
          type: "condition",
        },
      ],
      match: "all",
    },
    type: "filtered_data_source",
  };
}

function textExpression(text: string): AutomationRichTextExpression {
  return { parts: [{ text, type: "text" }] };
}

export function newFilterCondition(): Extract<
  AutomationFilterDefinition["conditions"][number],
  { type: "condition" }
> {
  return {
    id: crypto.randomUUID(),
    operator: "is_not_empty",
    propertyId: "name",
    type: "condition",
  };
}

export function defaultRecipient(
  type: AutomationNotificationRecipient["type"],
  catalog?: DatabaseAutomationCatalog,
): AutomationNotificationRecipient {
  if (type === "selected_user") return { type, userId: catalog?.users[0]?.id ?? "" };
  if (type === "person_property")
    return {
      propertyId: catalog?.properties.find((property) => property.type === "person")?.id ?? "",
      type,
    };
  if (type === "variable") return { type, variableName: "" };
  return { type };
}

export function actionProperties(
  catalog?: DatabaseAutomationCatalog,
): DatabaseAutomationCatalog["properties"] {
  return [
    {
      id: "name",
      name: "Name",
      operators: [
        "was_edited",
        "is",
        "is_not",
        "contains",
        "does_not_contain",
        "starts_with",
        "ends_with",
        "is_empty",
        "is_not_empty",
      ],
      options: [],
      type: "title",
      writable: true,
    },
    ...(catalog?.properties.filter(({ writable }) => writable) ?? []),
  ];
}

export function canUseCompactPropertyAction(draft: NotionActionDraft) {
  if (draft.action.type !== "edit_trigger_page" || draft.action.operations.length !== 1)
    return false;
  const operation = draft.action.operations[0];
  return operation?.mode === "set" && operation.value?.type === "literal";
}

export function actionValuesFromLiteral(
  value: AutomationJsonValue,
  propertyType: string,
): string[] {
  if (["multi_select", "person", "relation", "select", "status"].includes(propertyType)) {
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap((item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      "id" in item &&
      typeof item.id === "string"
        ? [item.id]
        : [],
    );
  }
  return value === null ? [] : [String(value)];
}

export function actionLiteralFromValues(
  values: string[],
  propertyType: string,
): AutomationJsonValue {
  if (propertyType === "number") return Number(values[0] ?? 0);
  if (propertyType === "checkbox") return values[0] === "true";
  if (["select", "status"].includes(propertyType)) {
    return { entityType: "option", id: values[0] ?? "", type: "entity" };
  }
  const entityTypes: Record<string, "option" | "user" | "page"> = {
    multi_select: "option",
    person: "user",
    relation: "page",
  };
  const entityType = Object.hasOwn(entityTypes, propertyType)
    ? entityTypes[propertyType]
    : undefined;
  if (entityType) return values.map((id) => ({ entityType, id, type: "entity" }));
  return values[0] ?? "";
}

export function propertyActionLabel(draft: NotionActionDraft, catalog?: DatabaseAutomationCatalog) {
  if (draft.action.type !== "edit_trigger_page") return notionActionLabel(draft.action.type);
  const operation = draft.action.operations[0];
  if (!operation) return "Edit property";
  const property = actionProperties(catalog).find((item) => item.id === operation.propertyId) ?? {
    name: "property",
    type: "text",
    options: [],
  };
  if (operation.mode === "clear") return `Clear ${property.name}`;
  if (operation.value?.type !== "literal") return `Set ${property.name}`;
  const values = actionValuesFromLiteral(operation.value.value, property.type);
  const labels = values.map(
    (value) =>
      property.options.find((option) => option.id === value)?.name ??
      catalog?.users.find((user) => user.id === value)?.name ??
      value,
  );
  return `Set ${property.name} to ${labels.join(", ") || "value"}`;
}

export async function materializeWebhookSecrets(
  draft: BuilderDraft,
  createSecret: (input: { purpose: "webhook_header"; value: string }) => Promise<{ id: string }>,
) {
  let saveDraft = draft;
  for (const actionDraft of saveDraft.actions) {
    if (actionDraft.action.type !== "send_webhook") continue;
    for (const header of actionDraft.webhookHeaders) {
      if (!header.name.trim() || !header.value) continue;
      const secret = await createSecret({
        purpose: "webhook_header",
        value: header.value,
      });
      saveDraft = {
        ...saveDraft,
        actions: saveDraft.actions.map((candidate) =>
          candidate.action.id === actionDraft.action.id
            ? resolveWebhookHeader(candidate, header.key, secret.id)
            : candidate,
        ),
      };
    }
  }
  return saveDraft;
}
