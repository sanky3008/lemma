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

type DiscussionThread = {
  isResolved: boolean;
  messages: { author: string; text: string }[];
};

/**
 * Build a map of discussionId -> DiscussionThread from the flat Convex comments array.
 */
function buildDiscussionMap(comments: any[]): Map<string, DiscussionThread> {
  const map = new Map<string, DiscussionThread>();
  const sorted = [...comments].sort((a, b) => a.createdAt - b.createdAt);

  for (const c of sorted) {
    if (!map.has(c.discussionId)) {
      map.set(c.discussionId, { isResolved: c.isResolved, messages: [] });
    }
    const thread = map.get(c.discussionId)!;
    const contentField = c.content ?? c.contentRich;
    const text = contentField?.[0]?.children?.[0]?.text || '';
    thread.messages.push({ author: c.userInfo?.name || 'Unknown', text });
  }

  return map;
}

/**
 * Serialize Plate nodes to XML string with inline comment threads.
 * Pass the Convex comments array to inline thread content directly on annotated text.
 */
export function serializeToXML(nodes: any[], comments?: any[]): string {
  const discussionMap = comments ? buildDiscussionMap(comments) : new Map<string, DiscussionThread>();
  const lines: string[] = ['<document>'];

  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      lines.push(serializeNodeToXML(node, discussionMap));
    }
  }

  lines.push('</document>');
  return lines.join('\n');
}

function serializeNodeToXML(node: any, discussionMap: Map<string, DiscussionThread>): string {
  // Handle Text Nodes
  if (node.text !== undefined) {
    let text = escapeXML(node.text);

    if (node.code) text = `\`${text}\``;
    if (node.bold) text = `**${text}**`;
    if (node.italic) text = `_${text}_`;
    if (node.strikethrough) text = `~~${text}~~`;

    // Inline comment threads on the annotated text span
    const commentKeys = Object.keys(node).filter(k => k.startsWith('comment_'));
    for (const key of commentKeys) {
      if (node[key] !== true) continue;
      const discussionId = key.substring('comment_'.length);
      const thread = discussionMap.get(discussionId);

      if (thread) {
        const resolvedAttr = thread.isResolved ? ' resolved="true"' : '';
        const threadXml = thread.messages
          .map((m, i) => {
            const tag = i === 0 ? 'message' : 'reply';
            return `<${tag} author="${escapeXML(m.author)}">${escapeXML(m.text)}</${tag}>`;
          })
          .join('');
        text = `<comment id="${discussionId}"${resolvedAttr}><thread>${threadXml}</thread>${text}</comment>`;
      } else {
        // Thread not loaded yet — still mark the anchor so the AI knows a comment exists
        text = `<comment id="${discussionId}">${text}</comment>`;
      }
    }

    return text;
  }

  // Handle Elements
  const children = Array.isArray(node.children)
    ? node.children.map((c: any) => serializeNodeToXML(c, discussionMap)).join('')
    : '';

  let type = node.type || 'p';
  const id = node.id || '';

  if (type === 'heading' && node.level) type = `h${node.level}`;

  if (type === 'table') return `<block id="${id}" type="table">${children}</block>`;
  if (type === 'tr') return `<row>${children}</row>`;
  if (type === 'td' || type === 'th') return `<cell>${children}</cell>`;

  return `<block id="${id}" type="${type}">${children}</block>`;
}

function escapeXML(str: string) {
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
