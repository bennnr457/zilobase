export function shouldUseDatabaseSetupMode({
  dataSettled,
  editable,
  hasContent,
  setupDismissed,
  setupMode,
}: {
  dataSettled: boolean;
  editable: boolean;
  hasContent: boolean;
  setupDismissed: boolean;
  setupMode: boolean;
}) {
  return Boolean(editable && !setupDismissed && dataSettled && (setupMode || !hasContent));
}
