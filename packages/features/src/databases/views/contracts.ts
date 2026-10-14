import type { DatabasePropertyFilterOperator, DatabaseSortDirection } from "./configuration";
export type DatabaseViewProperty = {
  id: string;
  property: {
    config?: unknown;
    id: string;
    name: string;
    type: string;
  };
};

export type DatabaseSourceMenuItem = {
  config?: unknown;
  hiddenViewCount?: number;
  id: string;
  name: string;
  parentDatabaseId: string;
  position?: number;
  viewCount: number;
};

export type DatabaseFieldOption = {
  color?: string;
  fieldIcon?: { kind: "name" } | { kind: "property"; propertyType: string };
  label: string;
  searchText?: string;
  value: string;
};

export type DatabaseCondition = {
  id: string;
  label: string;
  operator: DatabasePropertyFilterOperator;
  operatorLabel: string;
  propertyId: string;
  propertyType: string;
  values: string[];
};

export type DatabaseConditionUpdatePatch = {
  operator?: DatabasePropertyFilterOperator;
  propertyId?: string;
  values?: string[];
};

export type DatabaseActiveFilter = DatabaseCondition;

export type DatabaseFilterUpdatePatch = DatabaseConditionUpdatePatch;

export type DatabaseActiveSort = {
  column: string;
  direction: DatabaseSortDirection;
  label: string;
};

export type DatabaseSortUpdatePatch = {
  column?: string;
  direction?: DatabaseSortDirection;
};
