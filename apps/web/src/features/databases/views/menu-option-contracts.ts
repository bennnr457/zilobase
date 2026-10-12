import type { ReactNode } from "react";
import type { DatabaseFieldOption } from "@zilobase/features/databases/models";

export type DatabaseSearchableMenuOption = Omit<DatabaseFieldOption, "fieldIcon"> & {
  icon?: ReactNode;
};
