# ReUI Code Block

Source: https://reui.io/r/styles/radix-mira/code-block.json

Retrieved 2026-10-18. Registry snapshot SHA-256: `bcb802bac64b284565f6c321ac9c2301d035d15cdae98df6772fb73b112d7338`. The registry does not expose a Git revision. MIT license retained in LICENSE.

Local adaptations map imports, ANSI-16 fallback colors, and diff/diagnostic states to Zilobase's shared primitives and semantic tokens; development checks use Vite's environment flags. `CodeBlockContent` accepts application-owned content so Tiptap retains its editable DOM, selection, paste, collaboration, and undo. `CodeBlockCopyButton` accepts a clipboard callback and an option to preserve literal source instead of stripping viewer notation comments.

The editor uses the existing Shiki ProseMirror decorations and disables ReUI's additional highlighter. Its document schema and existing language aliases remain unchanged. Read-only rendering and copy use the same composition. The editor exposes no wrap control and preserves horizontal scrolling. Shiki background decorations on the outer React node are transparent so they cannot show through the rounded frame. The upstream viewer and lazy highlighter remain available as generic primitives; no new dependency is added.
