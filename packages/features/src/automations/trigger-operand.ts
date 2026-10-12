import type { AutomationTriggerOperand, DatabaseAutomationTriggerOperator } from "./contracts";

export function automationOperandValues(operand: AutomationTriggerOperand | undefined): string[] {
  if (operand === undefined || operand === null) return [];
  if (typeof operand === "string" || typeof operand === "number" || typeof operand === "boolean")
    return [String(operand)];
  if (operand.type === "entity") return [operand.id];
  if (operand.type === "entity_list") return operand.ids;
  if (operand.type === "date") return [operand.value.slice(0, 10)];
  if (operand.type === "date_range") return [operand.start.slice(0, 10), operand.end.slice(0, 10)];
  return [`relative:${operand.direction}:${operand.unit}`];
}

export function automationOperandFromValues(
  values: string[],
  propertyType: string,
  operator: DatabaseAutomationTriggerOperator,
): AutomationTriggerOperand | undefined {
  const value = values[0];
  if (!value) return undefined;
  if (propertyType === "number") return Number(value);
  if (propertyType === "checkbox") return value === "true";
  if (propertyType === "date") {
    if (operator === "is_between") {
      if (!values[1]) return undefined;
      return {
        end: new Date(values[1]).toISOString(),
        start: new Date(value).toISOString(),
        type: "date_range",
      };
    }
    if (operator === "is_relative_to_today") {
      const [, direction = "this", unit = "week"] = value.split(":");
      return {
        amount: 1,
        direction: direction as "next" | "past" | "this",
        type: "relative_date",
        unit: unit as "day" | "month" | "week" | "year",
      };
    }
    return { precision: "date", type: "date", value: new Date(value).toISOString() };
  }
  if (["select", "status", "multi_select"].includes(propertyType)) {
    return values.length > 1
      ? { entityType: "option", ids: values, type: "entity_list" }
      : { entityType: "option", id: value, type: "entity" };
  }
  if (propertyType === "person") {
    return values.length > 1
      ? { entityType: "user", ids: values, type: "entity_list" }
      : { entityType: "user", id: value, type: "entity" };
  }
  if (propertyType === "relation") return { entityType: "page", id: value, type: "entity" };
  return value;
}
