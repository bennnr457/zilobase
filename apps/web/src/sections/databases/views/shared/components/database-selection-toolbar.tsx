import { MoreHorizontal, Trash2 } from "@/components/icons";
import { ButtonGroup, ButtonGroupItem } from "@/components/ui/button-group";
import { useDatabaseRowActions } from "./database-row-actions";
export function DatabaseSelectionToolbar({
  clearSelection,
  selectedCount,
}: {
  clearSelection: () => void;
  selectedCount: number;
}) {
  const actions = useDatabaseRowActions();
  return (
    <ButtonGroup
      aria-label="Selected row actions"
      className="database-selection-toolbar"
      role="toolbar"
      variant="segmented"
    >
      <ButtonGroupItem
        aria-label={`Clear selection of ${selectedCount} rows`}
        onClick={clearSelection}
        tone="accent"
        type="button"
      >
        {selectedCount} selected
      </ButtonGroupItem>
      <ButtonGroupItem
        aria-label="Move selected rows to Trash"
        disabled={!actions?.canTrash || actions.pending}
        layout="icon"
        onClick={() => actions?.trash()}
        type="button"
      >
        <Trash2 />
      </ButtonGroupItem>
      <ButtonGroupItem
        aria-label="More selected row actions"
        layout="icon"
        onClick={(event) => actions?.open(event.currentTarget)}
        type="button"
      >
        <MoreHorizontal />
      </ButtonGroupItem>
    </ButtonGroup>
  );
}
