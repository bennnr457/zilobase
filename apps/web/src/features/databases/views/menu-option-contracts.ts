import type { ReactNode } from "react";
import type { DatabaseFieldOption } from "@zilobase/features/databases";

export type DatabaseSearchableMenuOption = Omit<DatabaseFieldOption, "fieldIcon"> & {
  icon?: ReactNode;
};
