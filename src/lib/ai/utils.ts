// Shared utility: flatten deeply-nested Plate.js list nodes to prevent
// Convex's 16-level document nesting limit from being exceeded.

export function flattenNestedLists(nodes: any[]): any[] {
    return nodes.map((node) => {
        if (node.type === 'ul' || node.type === 'ol') {
            return { ...node, children: flattenListItems(node.children ?? []) };
        }
        if (node.children) {
            return { ...node, children: flattenNestedLists(node.children) };
        }
        return node;
    });
}

function flattenListItems(liItems: any[]): any[] {
    const result: any[] = [];
    for (const li of liItems) {
        const lic = (li.children ?? []).filter((c: any) => c.type === 'lic');
        const nested = (li.children ?? []).filter(
            (c: any) => c.type === 'ul' || c.type === 'ol'
        );
        const other = (li.children ?? []).filter(
            (c: any) => c.type !== 'lic' && c.type !== 'ul' && c.type !== 'ol'
        );

        // Keep the item itself (without nested lists)
        result.push({ ...li, children: [...lic, ...other] });

        // Hoist nested list items up to the same level
        for (const nestedList of nested) {
            result.push(...flattenListItems(nestedList.children ?? []));
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
