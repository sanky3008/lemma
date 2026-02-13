import { MarkdownPlugin, serializeMd } from '@platejs/markdown';
import { createSlateEditor } from 'platejs';
import remarkGfm from 'remark-gfm';
import type { Doc, Folder } from '../types';

/**
 * Create a headless Slate editor with MarkdownPlugin for serialization.
 * Includes remarkGfm so that tables, strikethrough, etc. are properly handled.
 */
export function createMarkdownEditor() {
  return createSlateEditor({
    plugins: [
      MarkdownPlugin.configure({
        options: {
          remarkPlugins: [remarkGfm],
        },
      }),
    ],
  });
}

/**
 * Serialize an array of Plate nodes to annotated markdown with block ID comments.
 * Each top-level node gets a `<!--block:ID-->` annotation.
 */
export function serializeToAnnotatedMarkdown(
  editor: ReturnType<typeof createSlateEditor>,
  nodes: any[]
): string {
  const lines: string[] = [];

  for (const node of nodes) {
    const id = node.id;
    try {
      const md = serializeMd(editor, { value: [node] }).trim();
      if (id) {
        lines.push(`<!--block:${id}-->`);
      }
      lines.push(md);
      lines.push('');
    } catch (error) {
      // Skip nodes that can't be serialized (e.g., MDX JSX elements)
      console.warn('Failed to serialize node:', node.type, error);
    }
  }

  return lines.join('\n').trim();
}

/**
 * Serialize a doc's Plate JSON content to plain markdown (no block annotations).
 */
export function serializeDocToMarkdown(content: any[]): string {
  const editor = createMarkdownEditor();
  return serializeMd(editor, { value: content });
}

/**
 * Build a directory tree string from folders and docs.
 */
export function buildDirectoryTree(folders: Folder[], docs: Doc[]): string {
  const lines: string[] = ['Documents:'];

  const contextDoc = docs.find((d) => d.isContext);
  if (contextDoc) {
    lines.push(`  📄 ${contextDoc.title} [docId: ${contextDoc.id}] (Global Context)`);
  }

  for (const folder of folders) {
    lines.push(`  📁 ${folder.name}/ [folderId: ${folder.id}]`);
    const folderDocs = docs.filter((d) => d.folderId === folder.id);
    for (const doc of folderDocs) {
      lines.push(`    📄 ${doc.title} [docId: ${doc.id}]`);
    }
  }

  const rootDocs = docs.filter((d) => !d.folderId && !d.isContext);
  for (const doc of rootDocs) {
    lines.push(`  📄 ${doc.title} [docId: ${doc.id}]`);
  }

  return lines.join('\n');
}
