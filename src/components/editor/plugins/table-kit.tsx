'use client';

import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from '@platejs/table/react';
import {
  getTableAbove,
  getTableEntries,
  getCellTypes,
} from '@platejs/table';
import { Hotkeys, PathApi, KEYS } from 'platejs';

import {
  TableCellElement,
  TableCellHeaderElement,
  TableElement,
  TableRowElement,
} from '@/components/ui/table-node';

export const TableKit = [
  TablePlugin.withComponent(TableElement).extend({
    handlers: {
      onKeyDown: ({ editor, event }) => {
        // ── Fix 1: cursor reset on fast typing ───────────────────────────
        // The built-in handler collapses expanded selections on keyCode 229
        // (IME/composition pending). On fast typing, normal keys can also fire
        // with keyCode 229, causing the cursor to jump to the end.
        // We guard: only collapse when selection spans MULTIPLE cells.
        if (event.which === 229 && editor.selection && editor.api.isExpanded()) {
          const cellNodes = Array.from(
            editor.api.nodes({
              at: editor.selection,
              match: { type: getCellTypes(editor) },
            })
          );
          if (cellNodes.length > 1) {
            editor.tf.collapse({ edge: 'end' });
          }
          // Always stop here so the default handler doesn't double-fire.
          return;
        }

        // ── Fix 2: exit table on Enter in last cell of last row ───────────
        if (Hotkeys.isSplitBlock(event) && editor.api.isCollapsed()) {
          const entries = getTableEntries(editor);
          if (entries) {
            const { cell, row } = entries;
            const [, cellPath] = cell;
            const [, rowPath] = row;

            const tableEntry = getTableAbove(editor, { at: cellPath });
            if (tableEntry) {
              const [tableNode, tablePath] = tableEntry;
              const rows = tableNode.children as any[];
              const lastRowIndex = rows.length - 1;
              const lastRow = rows[lastRowIndex];
              const cells = lastRow.children as any[];
              const lastCellIndex = cells.length - 1;

              const isLastRow = rowPath[rowPath.length - 1] === lastRowIndex;
              const isLastCell = cellPath[cellPath.length - 1] === lastCellIndex;

              if (isLastRow && isLastCell) {
                event.preventDefault();
                // Insert a paragraph node after the table
                const afterTablePath = PathApi.next(tablePath);
                editor.tf.insertNodes(
                  { type: KEYS.p, children: [{ text: '' }] } as any,
                  { at: afterTablePath }
                );
                editor.tf.select(afterTablePath);
                return;
              }
            }
          }
        }
      },
    },
  }),
  TableRowPlugin.withComponent(TableRowElement),
  TableCellPlugin.withComponent(TableCellElement),
  TableCellHeaderPlugin.withComponent(TableCellHeaderElement),
];
