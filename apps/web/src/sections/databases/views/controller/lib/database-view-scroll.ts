const verticalScrollOverflowValues = new Set(["auto", "overlay", "scroll"]);

export function isVerticalScrollContainer({
  clientHeight,
  overflowY,
  scrollHeight,
}: {
  clientHeight: number;
  overflowY: string;
  scrollHeight: number;
}) {
  return verticalScrollOverflowValues.has(overflowY) && scrollHeight > clientHeight;
}

export function shouldRenderVirtualizedDatabaseRows({
  hasScrollElement,
  virtualRowCount,
  virtualizationEnabled,
}: {
  hasScrollElement: boolean;
  virtualRowCount: number;
  virtualizationEnabled: boolean;
}) {
  return virtualizationEnabled && hasScrollElement && virtualRowCount > 0;
}
