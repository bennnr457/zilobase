export type TimelineRowLayout = {
  centers: Record<string, number>;
  dropTops: number[];
  heights?: Record<string, number>;
  rowIds?: string[];
};

export type TimelineGroupDropTarget = {
  sectionId: string;
  localTargetIndex: number;
  top: number;
};

export type TimelineGroupDropGeometry = {
  sectionId: string;
  top: number;
  bottom: number;
  footerTop: number;
  rows: { top: number; bottom: number }[];
};

/** A group's final boundary belongs above its creation row, even when empty. */
export function getTimelineGroupDropTarget(
  groups: TimelineGroupDropGeometry[],
  pointerTop: number,
): TimelineGroupDropTarget | null {
  const distance = (group: TimelineGroupDropGeometry) =>
    Math.max(group.top - pointerTop, pointerTop - group.bottom, 0);
  const group = groups.reduce<TimelineGroupDropGeometry | null>(
    (closest, candidate) =>
      !closest || distance(candidate) < distance(closest) ? candidate : closest,
    null,
  );
  if (!group) return null;
  const before = group.rows.findIndex((row) => pointerTop < (row.top + row.bottom) / 2);
  const localTargetIndex = before === -1 ? group.rows.length : before;
  return {
    sectionId: group.sectionId,
    localTargetIndex,
    top: group.rows[localTargetIndex]?.top ?? group.footerTop,
  };
}

export const emptyTimelineRowLayout: TimelineRowLayout = {
  centers: {},
  dropTops: [],
};

const positionsMatch = (first: number | undefined, second: number) =>
  first !== undefined && Math.abs(first - second) < 0.5;

export function timelineRowLayoutsMatch(current: TimelineRowLayout, next: TimelineRowLayout) {
  const currentRowIds = Object.keys(current.centers);
  const nextRowIds = Object.keys(next.centers);

  if (
    currentRowIds.length !== nextRowIds.length ||
    current.dropTops.length !== next.dropTops.length ||
    (current.rowIds ?? []).join("|") !== (next.rowIds ?? []).join("|")
  ) {
    return false;
  }

  return (
    nextRowIds.every((rowId) => positionsMatch(current.centers[rowId], next.centers[rowId])) &&
    next.dropTops.every((top, index) => positionsMatch(current.dropTops[index], top))
  );
}

export function getTimelineRowDropTargetIndex(
  rowIds: string[],
  rowCenters: Record<string, number>,
  pointerTop: number,
) {
  let low = 0;
  let high = rowIds.length;

  while (low < high) {
    const index = Math.floor((low + high) / 2);
    const center = rowCenters[rowIds[index]];

    if (center !== undefined && pointerTop < center) {
      high = index;
    } else {
      low = index + 1;
    }
  }

  return low;
}
