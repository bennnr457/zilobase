# Whitespace block selection implementation plan

Add mouse drag selection from the page body's whitespace, with a translucent rectangle and whole-block highlights like the reference. Integrate it with the editor's existing selection, clipboard, block movement, history, and resource protections.

## Interaction contract

- Start with the primary mouse button on a body gutter, an inter-block gap, or unused editor space. Activate after five pixels of movement.
- Keep text dragging, block controls, checkboxes, nested editors, metadata, scrollbars, modified clicks, and touch gestures under their existing handlers.
- Support dragging from either side and in either vertical direction. Select the contiguous document range from the first intersecting block to the last.
- Treat top-level list items as individual blocks. Keep other containers, including columns, tabs, callouts, tables, and embedded resources, as whole outer blocks.
- Preserve partial lists when the rectangle continues across another block. Include empty paragraphs and atomic blocks.
- Update highlights while dragging. Retracting into empty space clears them. Releasing removes the rectangle and retains the selected blocks.
- A plain whitespace click places a caret. Escape during a gesture restores the previous selection; Escape after release collapses the block selection. Select all expands a partial block selection.
- Scroll the enclosing editor viewport when the pointer approaches its vertical edges. Keep the anchor attached to the content while scrolling.
- Scope each gesture to its editor. End it on document changes, loss of editability, editor teardown, pointer cancellation, or window blur. Preserve ProseMirror's mapped selection on document changes.

## Implementation sequence

1. Extend the existing block-selection plugin with a range mode. Reuse its decorations, native-selection suppression, and guards for embedded resources. Continue to support staged select all.
2. Add an exact contiguous `BlockRangeSelection`. Its endpoints can cross list depths without expanding unselected siblings. Implement equality, JSON serialization, transaction mapping, and history bookmarks. Fall back to a caret if mapped endpoints no longer bound blocks.
3. Add a view-owned marquee controller in `selection/lib`. Resolve the mounted surface when the gesture starts because Tiptap can create its view before React mounts it. Separate DOM gesture handling from selection transactions through callbacks.
4. Cache selectable document ranges at pointer down. Read current block rectangles once per animation frame, normalize the rectangle for every drag direction, and dispatch only when the selected range changes. Process the release coordinates before finishing.
5. Render the rectangle inside the owning surface with the existing selection and focus tokens. Keep it inert and hidden from accessibility APIs. Suppress native text selection during an active gesture.
6. Attach document listeners only for gesture tracking, apart from the scoped pointer-down entrypoint. Remove listeners, animation frames, temporary classes, and the rectangle on every completion or interruption path.
7. Update nested meeting focus handling to clear the outer range selection through the existing selection predicate.

## Verification

Use the existing isolated browser fixture with actual mouse and keyboard input. Run its server on a separate port when the normal test port is occupied.

- Exercise all four combinations of side and vertical direction, persistent highlights after release, and text editing after Escape.
- Verify delete and undo for ordinary blocks, individual list-item deletion, partial lists across headings and atoms, and embedded-resource protection.
- Verify native text dragging, whitespace clicks, checkbox interaction, read-only mode, selection retraction, and select all.
- Verify stationary edge scrolling, scroll shutdown after release, document replacement, document edits during a drag, existing block moving, and isolation from adjacent panes.
- Cover geometry boundaries, selection serialization, mapped insertions, bookmarks, and deletion across list depths with focused unit tests.
- Run existing editor and selection-toolbar browser regressions, web tests, the web typecheck, lint, formatting, and architecture checks.

## Scope

The feature stays within the web editor presentation layer and works through the same extension in hosted editors. Selection remains transient editor state and does not change page content or backend operations. Modifier-based additive selection, touch marquee gestures, and selection of individual blocks inside outer containers are outside this implementation.

## Database record selection

Extend the gesture to table, list, gallery, Kanban, and timeline record views. Keep calendar date gestures, charts, and forms with their existing interactions.

- Use one database-owned DOM gesture hook and the existing `useDatabaseSelection` state. Table and timeline checkboxes, card/list highlights, and the shared bulk-action toolbar read the same selected record IDs.
- Start only from a view's whitespace or aligned ancestor gutter. Treat the empty hover area beside row controls as whitespace while preserving the actual drag handles, checkboxes, cell editors, page links, and card dragging.
- Activate after five pixels, normalize reverse drags, update at most once per animation frame, and process release coordinates before removing the rectangle. A small movement leaves selection unchanged.
- Keep selection within its owning view, including embedded databases, narrow page layouts, and neighboring database instances. Clip horizontal hit bounds to the visible scroll viewport. Yield the page editor's aligned gutter to an embedded database gesture, focus the database on activation, and clear any outer block selection when the database receives focus.
- Scroll the enclosing vertical viewport at its edges. Retain measured content coordinates for virtualized table rows so traversed records remain selected after they unmount; refresh mounted-row geometry every frame.
- Escape, pointer cancellation, and window blur restore the selection captured before dragging. View, record-window, editability, and lifecycle changes dispose the gesture. Reset selection when its database/view scope changes and prune removed record IDs.
- Reuse existing record commands and property history for selected rows; selection itself remains transient web presentation state.

Database browser coverage lives in `scripts/databases/e2e/marquee.spec.mjs`. It exercises all five renderers, four table drag directions, cancellation, retraction, below-threshold movement, cell editing, modified input, read-only views, scope changes, virtualized edge scrolling, collapsed groups, removed records, embedded layouts, and neighboring view isolation. Run the existing table, timeline, and editor marquee regressions alongside web tests, the web typecheck, lint, formatting, and architecture checks.

### Standalone database page whitespace

The standalone `DatabaseMainPane` marks its complete page body as a selection region and fills its scrolling viewport. Record views inside that region accept whitespace starts above and below the records, including the large unused area below a short table. Embedded editor databases retain their row-aligned boundary. The region's horizontal bounds prevent gestures from starting in the sidebar or a neighboring pane; titles, toolbar controls, cells, and cards retain their existing handlers.

The isolated database browser suite covers upward drags from both lower gutters and downward drags from above, plus sidebar exclusion and embedded-editor ownership. The signed-in application harness additionally exercises the real `/d/:id` route with PostgreSQL-backed records, verifies row highlighting and the bulk-action toolbar, and saves `standalone-marquee.png` as evidence.

### Whitespace and marquee appearance

Standalone database gestures use hit testing throughout their page region, including empty metadata and toolbar containers. Text glyphs, buttons, links, inputs, editable fields, record cells, and drag controls keep their native interactions. Embedded databases keep their editor-owned boundary. Both database and editor marquees use a 12% focus-color tint with no border so underlying content remains visible.

## Completion

Implemented in two commits:

- `d242b23e81` — editor block range selection, gesture lifecycle, shared marquee color token, and editor coverage.
- `3c162bff87` — database record selection across five views, standalone page whitespace, and database coverage.

The completed verification includes 44 database/editor gesture browser checks, signed-in standalone database application checks, web tests, web typechecking, lint, formatting, color-token synchronization, and architecture checks. After moving the marquee tint into the shared token system, both heading and toolbar whitespace browser checks passed again. Both implementation commits passed their repository commit hooks.
