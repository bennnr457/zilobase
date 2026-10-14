import type { useAddDatabaseProperty, useUpdateDatabaseProperty } from "../mutations/properties";
import type { useAddDatabaseRow, useUpdateDatabasePropertyValue } from "../mutations/rows";
import type { useChangeDatabaseRow } from "../interactions/react";
import type { useAddDatabaseView, useUpdateDatabaseView } from "../mutations/views";
import type { useUpdateDataSource } from "../mutations/data-sources";

export type DatabaseRowMutations = {
  addRow: ReturnType<typeof useAddDatabaseRow>;
  changeRow: ReturnType<typeof useChangeDatabaseRow>;
  updateValue: ReturnType<typeof useUpdateDatabasePropertyValue>;
};

export type DatabasePropertyMutations = {
  addProperty: ReturnType<typeof useAddDatabaseProperty>;
  updateProperty: ReturnType<typeof useUpdateDatabaseProperty>;
};

export type DatabaseViewMutations = {
  addDatabaseView: ReturnType<typeof useAddDatabaseView>;
  updateDatabase: ReturnType<typeof useUpdateDataSource>;
  updateDatabaseView: ReturnType<typeof useUpdateDatabaseView>;
};

export type DatabaseMutations = DatabasePropertyMutations &
  DatabaseRowMutations &
  DatabaseViewMutations;
