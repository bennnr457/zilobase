import type { OpenPageOptions } from "@/sections/pages/navigation/hooks/page-navigation";

export type DatabaseBlockEditorRuntime = {
  getEditable: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

export type DatabaseBlockOptions = {
  currentPageId?: string | null;
  editable?: boolean;
  editorRuntime?: DatabaseBlockEditorRuntime;
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void;
  workspaceId?: string | null;
};
