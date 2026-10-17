# ReUI Data Grid

Source: https://reui.io/r/styles/radix-mira/data-grid.json

Retrieved 2026-10-17. Registry snapshot SHA-256: `f6cd672f8fb74426ae13ec9532216d281d4462950e00c6efca1a1ab73e11f8b3`. MIT license retained in LICENSE. Uses TanStack Table 9.3.1.

Vendored core table, cell-selection controller, and labels from the Radix variant. Local adaptations use Zilobase icons and semantic tokens, native table/row/cell attribute slots, and one explicit body viewport for split headers and grouped tables. Database adapters retain shared commands, existing property editors, group layout, outside row controls, and page-owned virtualization. Unused upstream menus, pagination, drag engines, and table variants are not vendored.

The selection controller navigates the complete loaded display order, including unmounted virtual rows, through a consumer scroll callback. Editors track their own cell across virtual-window updates. Delayed cut completion is guarded by controller lifetime and selection identity. Zilobase keeps single-click property popovers while keyboard text editing uses ReUI overlays.

Editable-target guards respect native `isContentEditable` boundaries so database nodes marked `contentEditable={false}` retain grid keyboard and clipboard behavior when embedded in the page editor.
