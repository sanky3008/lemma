// Shared utility: flatten deeply-nested Plate.js list nodes to prevent
// Convex's 16-level document nesting limit from being exceeded.

export function flattenNestedLists(nodes: any[]): any[] {
    const result: any[] = [];
    for (const node of nodes) {
        if (node.type === 'ul' || node.type === 'ol') {
            result.push(...convertListToIndent(node, 1));
        } else if (node.children) {
            result.push({ ...node, children: flattenNestedLists(node.children) });
        } else {
            result.push(node);
        }
    }
    return result;
}

function convertListToIndent(listNode: any, depth: number): any[] {
    const styleType = listNode.type === 'ol' ? 'decimal' : 'disc';
    const result: any[] = [];

    for (const li of listNode.children ?? []) {
        const contents = (li.children ?? []).filter(
            (c: any) => c.type !== 'ul' && c.type !== 'ol'
        );
        const nested = (li.children ?? []).filter(
            (c: any) => c.type === 'ul' || c.type === 'ol'
        );

        for (const content of contents) {
            // Convert lic (list item content) to a paragraph with indent props
            result.push({
                type: 'p',
                indent: depth,
                listStyleType: styleType,
                children: content.children ?? [{ text: '' }],
            });
        }

        for (const nestedList of nested) {
            result.push(...convertListToIndent(nestedList, depth + 1));
        }
    }
    return result;
}

// SSE stream parser — yields parsed JSON objects from a fetch Response.
export async function* parseSSEStream(
    response: Response
): AsyncGenerator<Record<string, unknown>> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    yield JSON.parse(line.slice(6)) as Record<string, unknown>;
                } catch {
                    // skip malformed lines
                }
            }
        }
    }
}
