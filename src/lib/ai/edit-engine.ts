import { MarkdownPlugin, deserializeMd } from '@platejs/markdown';
import { withAIBatch } from '@platejs/ai';
import { createSlateEditor, PathApi } from 'platejs';
import remarkGfm from 'remark-gfm';
import type { SlateEditor } from 'platejs';
import type { EditInstruction } from './types';

/**
 * Find a node by its ID in the editor, returning its path.
 */
function findNodePath(editor: SlateEditor, blockId: string): number[] | null {
  const entries = Array.from(
    editor.api.nodes({
      at: [],
      match: (n: any) => n.id === blockId,
    })
  );
  if (entries.length > 0) {
    return entries[0][1] as number[];
  }
  return null;
}

/**
 * Apply edit instructions to the active Plate editor.
 * Wraps all operations in a single undo batch via withAIBatch.
 * Returns an array of newly inserted block IDs for highlighting/scrolling.
 */
export function applyEditsToEditor(
  editor: SlateEditor,
  edits: EditInstruction[]
): string[] {
  const activeDocEdits = edits.filter(
    (e) => e.mode === 'single' || e.mode === 'range'
  );

  if (activeDocEdits.length === 0) {
    return [];
  }

  // Snapshot existing IDs so we can diff after
  const existingIds = new Set(
    editor.children.map((n: any) => n.id as string).filter(Boolean)
  );

  withAIBatch(editor, () => {
    editor.tf.withoutNormalizing(() => {
      // Apply edits in reverse document order to preserve paths
      const sortedEdits = [...activeDocEdits].sort((a, b) => {
        const pathA = a.mode === 'single'
          ? findNodePath(editor, a.blockId)
          : a.mode === 'range'
            ? findNodePath(editor, a.startBlockId)
            : null;
        const pathB = b.mode === 'single'
          ? findNodePath(editor, b.blockId)
          : b.mode === 'range'
            ? findNodePath(editor, b.startBlockId)
            : null;
        if (!pathA || !pathB) return 0;
        return pathB[0] - pathA[0];
      });

      for (const edit of sortedEdits) {
        if (edit.mode === 'single') {
          applySingleEdit(editor, edit);
        } else if (edit.mode === 'range') {
          applyRangeEdit(editor, edit);
        }
      }
    });
  });

  // Return IDs of newly inserted blocks
  return editor.children
    .filter((n: any) => n.id && !existingIds.has(n.id))
    .map((n: any) => n.id as string);
}

/**
 * Remove a node at path. If the node is nested (e.g. a list item) and removing it
 * would leave the parent empty, remove the parent instead to avoid normalizer artifacts.
 */
function removeNodeSafely(editor: SlateEditor, path: number[]): void {
  if (path.length === 1) {
    editor.tf.removeNodes({ at: path });
    return;
  }
  // Check if parent will become empty after removal
  const parentPath = path.slice(0, -1);
  const parentEntry = Array.from(editor.api.nodes({ at: parentPath, match: (_n, p) => p.length === parentPath.length }))[0];
  if (parentEntry) {
    const parentNode = parentEntry[0] as any;
    if (Array.isArray(parentNode.children) && parentNode.children.length === 1) {
      // Only child — remove the whole parent (top-level ancestor)
      editor.tf.removeNodes({ at: [path[0]] });
      return;
    }
  }
  editor.tf.removeNodes({ at: path });
}

function applySingleEdit(
  editor: SlateEditor,
  edit: Extract<EditInstruction, { mode: 'single' }>
): void {
  const path = findNodePath(editor, edit.blockId);
  if (!path) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Block ${edit.blockId} not found in editor`);
      console.log('Available nodes:', editor.children.map((n: any) => ({ id: n.id, type: n.type })));
    }
    return;
  }

  switch (edit.action) {
    case 'replace': {
      removeNodeSafely(editor, path);
      if (edit.markdown) {
        const topPath = [path[0]];
        const nodes = deserializeMd(editor, edit.markdown);
        editor.tf.insertNodes(nodes, { at: topPath });
      }
      break;
    }
    case 'insertAfter': {
      if (!edit.markdown) return;
      const nodes = deserializeMd(editor, edit.markdown);
      const topPath = [path[0]];
      editor.tf.insertNodes(nodes, { at: PathApi.next(topPath) });
      break;
    }
    case 'insertBefore': {
      if (!edit.markdown) return;
      const nodes = deserializeMd(editor, edit.markdown);
      const topPath = [path[0]];
      editor.tf.insertNodes(nodes, { at: topPath });
      break;
    }
    case 'delete': {
      removeNodeSafely(editor, path);
      break;
    }
  }
}

function applyRangeEdit(
  editor: SlateEditor,
  edit: Extract<EditInstruction, { mode: 'range' }>
): void {
  const startPath = findNodePath(editor, edit.startBlockId);
  const endPath = findNodePath(editor, edit.endBlockId);
  if (!startPath || !endPath) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Range blocks not found: ${edit.startBlockId} -> ${edit.endBlockId}`);
    }
    return;
  }

  const startIdx = startPath[0];
  const endIdx = endPath[0];

  // Remove nodes from end to start to preserve indices
  for (let i = endIdx; i >= startIdx; i--) {
    editor.tf.removeNodes({ at: [i] });
  }

  // Insert new content at start position
  if (edit.markdown) {
    const nodes = deserializeMd(editor, edit.markdown);
    editor.tf.insertNodes(nodes, { at: [startIdx] });
  }
}

/**
 * Apply edits to a non-active document using a headless editor.
 * Returns the updated Plate JSON content.
 */
export function applyEditsToDocContent(
  content: any[],
  edits: EditInstruction[]
): any[] {
  const editor = createSlateEditor({
    plugins: [
      MarkdownPlugin.configure({
        options: {
          remarkPlugins: [remarkGfm],
        },
      }),
    ],
    value: content,
  });

  for (const edit of edits) {
    if (edit.mode === 'single') {
      applySingleEdit(editor as unknown as SlateEditor, edit);
    } else if (edit.mode === 'range') {
      applyRangeEdit(editor as unknown as SlateEditor, edit);
    }
  }

  return editor.children as any[];
}
