export const databaseColorIds = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;
export type DatabaseColorId = (typeof databaseColorIds)[number];

export function getNextDatabaseOptionColor(optionCount: number) {
  return databaseColorIds[optionCount % databaseColorIds.length] ?? "default";
}
