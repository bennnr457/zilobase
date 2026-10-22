import { customType, timestamp } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// Search counters remain exact in SQL and JSON-safe in existing entity reads.
export const bigintText = customType<{ data: string; driverData: string }>({
  dataType: () => "bigint",
  fromDriver: (value) => String(value),
});

export function timestampColumns() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  };
}
