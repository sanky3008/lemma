import { MarkdownPlugin, deserializeMd } from '@platejs/markdown';
import { HtmlPlugin } from '@platejs/core';
import { importDocx } from '@platejs/docx-io';
import { createSlateEditor } from 'platejs';
import { getEditorDOMFromHtmlString } from 'platejs/static';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

function makeEditor() {
    return createSlateEditor({
        plugins: [
            HtmlPlugin,
            MarkdownPlugin.configure({
                options: {
                    remarkPlugins: [remarkMath, remarkGfm],
                },
            }),
        ],
    });
}

export function markdownToNodes(markdown: string): any[] {
    const editor = makeEditor();
    return deserializeMd(editor, markdown);
}

export function htmlToNodes(html: string): any[] {
    const editor = makeEditor();
    const dom = getEditorDOMFromHtmlString(html);
    return editor.api.html.deserialize({ element: dom });
}

export async function docxToNodes(arrayBuffer: ArrayBuffer): Promise<any[]> {
    const editor = makeEditor();
    const result = await importDocx(editor, arrayBuffer);
    return result.nodes as any[];
}
