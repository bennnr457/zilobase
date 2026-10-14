export {
  defaultStatusOption,
  defaultStatusOptions,
  getDefaultDatabasePropertyConfig,
  isReadOnlyPropertyType,
  isSelectLikePropertyType,
} from "@zilobase/features/databases";
import {
  ArrowUpRight,
  AtSign,
  BadgeCheck,
  BadgeHelp,
  Calendar,
  CircleChevronDown,
  CircleDashed,
  CheckSquare,
  Clock,
  Hash,
  Link,
  List,
  MapPin,
  MousePointerClick,
  Paperclip,
  Phone,
  Search,
  Sigma,
  Type,
  Users,
  type Icon,
} from "@/components/icons";
import { type DatabasePropertyType as DatabasePropertyTypeId } from "@zilobase/features/databases";

import type {
  DatabasePropertyFilterKind,
  DatabasePropertyCellKind,
} from "@zilobase/features/databases";
import { getDatabasePropertyCapability } from "@zilobase/features/databases";
export {
  getDatabasePropertyFilterKind,
  getDatabasePropertyCellKind,
  hasDatabasePropertyTypeEditSettings,
  isDateLikePropertyType,
} from "@zilobase/features/databases";
export type DatabasePropertyType = {
  cellKind?: DatabasePropertyCellKind;
  editable?: boolean;
  filterKind: DatabasePropertyFilterKind;
  hasEditSettings?: boolean;
  icon: Icon;
  label: string;
  type: DatabasePropertyTypeId;
};

const databasePropertyPresentation: Array<
  Array<Pick<DatabasePropertyType, "icon" | "label" | "type">>
> = [
  [
    { icon: Type, label: "Text", type: "text" },
    {
      icon: Hash,
      label: "Number",
      type: "number",
    },
    {
      icon: CircleChevronDown,
      label: "Select",
      type: "select",
    },
    {
      icon: List,
      label: "Multi-select",
      type: "multi_select",
    },
    {
      icon: CircleDashed,
      label: "Status",
      type: "status",
    },
    {
      icon: Calendar,
      label: "Date",
      type: "date",
    },
    {
      icon: Users,
      label: "Person",
      type: "person",
    },
    {
      icon: Paperclip,
      label: "Files & media",
      type: "files",
    },
    {
      icon: CheckSquare,
      label: "Checkbox",
      type: "checkbox",
    },
    {
      icon: Link,
      label: "URL",
      type: "url",
    },
    { icon: Phone, label: "Phone", type: "phone" },
    { icon: AtSign, label: "Email", type: "email" },
  ],
  [
    {
      icon: ArrowUpRight,
      label: "Relation",
      type: "relation",
    },
    {
      icon: Search,
      label: "Rollup",
      type: "rollup",
    },
    {
      icon: Sigma,
      label: "Formula",
      type: "formula",
    },
    {
      icon: MousePointerClick,
      label: "Button",
      type: "button",
    },
    { icon: BadgeHelp, label: "ID", type: "id" },
    { icon: MapPin, label: "Place", type: "place" },
    {
      icon: BadgeCheck,
      label: "Verification",
      type: "verification",
    },
  ],
  [
    {
      icon: Clock,
      label: "Created time",
      type: "created_time",
    },
    {
      icon: Clock,
      label: "Edited time",
      type: "edited_time",
    },
  ],
];

export const databasePropertyTypes: DatabasePropertyType[][] = databasePropertyPresentation.map(
  (group) => group.map((item) => ({ ...getDatabasePropertyCapability(item.type), ...item })),
);

export const databasePropertyTypeItems = databasePropertyTypes.flat();

export { getNextDatabaseOptionColor } from "@zilobase/features/databases";

export const textDatabasePropertyType =
  databasePropertyTypeItems.find((item) => item.type === "text") ?? databasePropertyTypes[0][0];

export function getDatabasePropertyType(type: string) {
  return databasePropertyTypeItems.find((item) => item.type === type) ?? textDatabasePropertyType;
}
