import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  ShortcutProvider,
  useAppShortcut,
  type AppShortcutId,
} from "../../../src/app/shortcuts/shortcut-provider";
import { UndoHistoryScope, useUndoHistory } from "../../../src/app/shortcuts/undo-history";

type Binding = {
  id: string;
  shortcutId: AppShortcutId;
  handler: (event: KeyboardEvent) => boolean;
  priority?: number;
  allowInEditable?: boolean;
};
type History = ReturnType<typeof useUndoHistory>;
type Scope = { id: string; resetKey: unknown };

function Binding({ binding }: { binding: Binding }) {
  useAppShortcut(binding.shortcutId, binding.handler, binding);
  return null;
}

export function mountShortcuts(container: HTMLElement) {
  const root = createRoot(container);
  const histories = new Map<string, History>();
  function HistoryProbe({ id }: { id: string }) {
    histories.set(id, useUndoHistory());
    return <span data-scope={id} />;
  }
  return {
    histories,
    render(bindings: Binding[] = [], scopes: Scope[] = []) {
      flushSync(() =>
        root.render(
          <StrictMode>
            <ShortcutProvider>
              {bindings.map((binding) => (
                <Binding key={binding.id} binding={binding} />
              ))}
              {scopes.map(({ id, resetKey }) => (
                <UndoHistoryScope key={id} resetKey={resetKey}>
                  <HistoryProbe id={id} />
                </UndoHistoryScope>
              ))}
            </ShortcutProvider>
          </StrictMode>,
        ),
      );
    },
    unmount: () => flushSync(() => root.unmount()),
  };
}
