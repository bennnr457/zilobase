import { useChangeDatabaseRow } from "@zilobase/features/databases/react";
import { toast } from "sonner";
import { getRecordDropChange, type RecordDrop } from "@zilobase/features/databases";

/** A renderer describes a drop; the session controller owns state and persistence. */
export function useRecordDrops(input: {
  databaseId: string | null | undefined;
  hostDatabaseId: string | null | undefined;
}) {
  const changeRow = useChangeDatabaseRow({ dataSourceId: input.databaseId ?? undefined });
  return {
    isPending: changeRow.isPending,
    submitMove(move: RecordDrop, clearSortViewId?: string) {
      if (!input.databaseId || !input.hostDatabaseId) return;
      changeRow.mutate(
        getRecordDropChange(input.hostDatabaseId, input.databaseId, move, clearSortViewId),
        { onError: (error) => toast.error(error.message) },
      );
    },
  };
}
