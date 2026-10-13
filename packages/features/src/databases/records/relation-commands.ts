import type { useAddDatabaseProperty, useUpdateDatabaseProperty } from "../mutations/properties";
import type { useUpdateDatabasePropertyValue } from "../mutations/rows";
import { diffConfiguration } from "../interactions/configuration";
import { getRelationConfig } from "../schema/relation-settings";
import {
  getRelationRepairMutationPlan,
  getRelationSelectionChange,
  getRelationTwoWayConfigUpdate,
} from "../schema/relations";
import type { DatabaseViewData } from "../views/source-state";
import type { DatabasePropertyValue } from "../schema/property-values";
import type { DatabasePropertyConfig } from "../views/configuration";

export function createDatabaseRelationCommands(mutations: {
  addProperty: Pick<ReturnType<typeof useAddDatabaseProperty>, "mutate">;
  updateProperty: Pick<ReturnType<typeof useUpdateDatabaseProperty>, "mutate">;
  updateValue: Pick<ReturnType<typeof useUpdateDatabasePropertyValue>, "mutate">;
}) {
  const { addProperty, updateProperty, updateValue } = mutations;
  return {
    repair(input: Parameters<typeof getRelationRepairMutationPlan>[0]) {
      const plan = getRelationRepairMutationPlan(input);
      if (!plan) return false;
      plan.valueUpdates.forEach((update) =>
        updateValue.mutate({
          databaseId: update.databaseId,
          propertyId: update.propertyId,
          rowId: update.rowId,
          value: update.value,
        }),
      );
      plan.configUpdates.forEach((update) => updateProperty.mutate(update));
      return true;
    },
    save(
      input: {
        selectedDatabase: { value: string; label: string; pageName: string } | null | undefined;
        relationConfig: ReturnType<typeof getRelationConfig>;
        relatedPropertyName: string;
        twoWayRelation: boolean;
        limit: string;
        sourceDatabaseId: string;
        sourceDatabaseName?: string;
        sourcePropertyId?: string;
      },
      onUpdateConfig: (config: DatabasePropertyConfig) => void,
    ) {
      const {
        selectedDatabase,
        relationConfig,
        relatedPropertyName,
        twoWayRelation,
        limit,
        sourceDatabaseId,
        sourceDatabaseName,
        sourcePropertyId,
      } = input;
      if (!selectedDatabase) return;
      const nextRelation = {
        ...relationConfig,
        relatedDatabaseId: selectedDatabase.value,
        relatedDatabaseName: selectedDatabase.label,
        relatedPageName: selectedDatabase.pageName,
        relatedPropertyName: relatedPropertyName.trim() || undefined,
        twoWayRelation,
      };
      if (!twoWayRelation || !relatedPropertyName.trim() || !sourcePropertyId) {
        onUpdateConfig({ relation: nextRelation });
        return;
      }
      addProperty.mutate(
        {
          config: {
            relation: {
              limit,
              relatedDatabaseId: sourceDatabaseId,
              relatedDatabaseName: sourceDatabaseName,
              relatedPropertyId: sourcePropertyId,
              twoWayRelation: true,
            },
          },
          databaseId: selectedDatabase.value,
          name: relatedPropertyName.trim(),
          type: "relation",
        },
        {
          onSuccess: (reciprocalProperty) =>
            onUpdateConfig({
              relation: { ...nextRelation, relatedPropertyId: reciprocalProperty.property.id },
            }),
        },
      );
    },
    setTwoWay(
      input: Parameters<typeof getRelationTwoWayConfigUpdate>[0] & {
        relationConfig: ReturnType<typeof getRelationConfig>;
        relatedPropertyName: string;
      },
      onUpdateConfig: (config: DatabasePropertyConfig) => void,
    ) {
      const update = getRelationTwoWayConfigUpdate(input);
      if (update) updateProperty.mutate(update);
      onUpdateConfig({
        relation: {
          ...input.relationConfig,
          relatedPropertyName: input.relatedPropertyName.trim() || undefined,
          twoWayRelation: input.nextTwoWayRelation,
        },
      });
    },
  };
}

export function applyDatabaseRelationSelection(
  mutations: {
    updateProperty: Pick<ReturnType<typeof useUpdateDatabaseProperty>, "mutate">;
    updateValue: Pick<ReturnType<typeof useUpdateDatabasePropertyValue>, "mutate">;
  },
  input: Parameters<typeof getRelationSelectionChange>[0] & {
    relatedViewData: DatabaseViewData | null | undefined;
    onPropertyConfigChange?: (config: unknown) => unknown;
    onSelect: (value: DatabasePropertyValue) => void;
  },
) {
  const { updateProperty, updateValue } = mutations;
  const { value, config, reciprocalUpdates } = getRelationSelectionChange(input);
  void input.onPropertyConfigChange?.(config);
  input.onSelect(value);
  reciprocalUpdates.forEach((update) => {
    if (update.config && update.databasePropertyId)
      updateProperty.mutate({
        configuration: diffConfiguration(
          input.relatedViewData?.bootstrap.properties.find(
            ({ id }) => id === update.databasePropertyId,
          )?.property.config,
          update.config,
        ),
        databaseId: update.databaseId,
        databasePropertyId: update.databasePropertyId,
      });
    updateValue.mutate({
      databaseId: update.databaseId,
      propertyId: update.propertyId,
      rowId: update.rowId,
      value: update.value,
    });
  });
}
