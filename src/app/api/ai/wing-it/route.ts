import { openai } from '@ai-sdk/openai';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { serializeToAnnotatedMarkdown, createMarkdownEditor } from '@/lib/ai/serialize';

export const maxDuration = 120;

type WriteSSE = (data: object) => void;

function sseResponse(fn: (write: WriteSSE) => Promise<void>): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const write: WriteSSE = (data) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };
            try {
                await fn(write);
            } catch (error: any) {
                write({ type: 'error', message: error?.message ?? 'Unknown error' });
            } finally {
                write({ type: 'done' });
                controller.close();
            }
        },
    });
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
}

function buildWorkspaceTools(
    allDocs: { id: string; title: string }[],
    convexToken?: string
) {
    return {
        webSearch: tool({
            description: 'Search the web for current information.',
            inputSchema: z.object({ query: z.string().describe('The search query') }),
            execute: async ({ query }) => {
                const apiKey = process.env.TAVILY_API_KEY;
                if (!apiKey) return { error: 'Tavily API key not configured' };
                try {
                    const res = await fetch('https://api.tavily.com/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ api_key: apiKey, query, max_results: 5, include_answer: true }),
                    });
                    const data = await res.json();
                    return {
                        answer: (data.answer as string) || '',
                        results: ((data.results || []) as { title: string; url: string; content: string }[]).map((r) => ({
                            title: r.title,
                            url: r.url,
                            snippet: r.content?.substring(0, 300) || '',
                        })),
                    };
                } catch {
                    return { error: 'Search failed' };
                }
            },
        }),

        extractContent: tool({
            description: 'Extract detailed content from a URL.',
            inputSchema: z.object({ url: z.string().url().describe('The URL to read') }),
            execute: async ({ url }) => {
                const apiKey = process.env.TAVILY_API_KEY;
                if (!apiKey) return { url, content: 'Tavily API key not configured' };
                try {
                    const res = await fetch('https://api.tavily.com/extract', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ api_key: apiKey, urls: [url] }),
                    });
                    const data = await res.json();
                    const extracted = data.results?.[0];
                    return {
                        url: extracted?.url || url,
                        content: extracted?.raw_content?.substring(0, 5000) || 'No content extracted',
                    };
                } catch {
                    return { url, content: 'Extraction failed' };
                }
            },
        }),

        readPage: tool({
            description: "Read a document from the user's workspace by its title.",
            inputSchema: z.object({ title: z.string().describe('The exact document title') }),
            execute: async ({ title }) => {
                const doc = allDocs.find((d) => d.title.toLowerCase() === title.toLowerCase());
                if (!doc) {
                    return {
                        content: `Document "${title}" not found. Available: ${allDocs.map((d) => d.title).join(', ')}`,
                    };
                }
                if (!convexToken) {
                    return { content: `Cannot read "${title}": authentication unavailable.` };
                }
                try {
                    const { ConvexHttpClient } = await import('convex/browser');
                    const { api } = await import('../../../../../convex/_generated/api');
                    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
                    client.setAuth(convexToken);
                    const result = await client.query(api.documents.getDocContent, { id: doc.id as any });
                    if (!result?.content) return { content: `"${title}" is empty.` };
                    const mdEditor = createMarkdownEditor();
                    const md = serializeToAnnotatedMarkdown(mdEditor, result.content);
                    return { title: doc.title, content: md };
                } catch (err: any) {
                    return { content: `Failed to read "${title}": ${err.message}` };
                }
            },
        }),
    };
}

export async function POST(req: Request) {
    const body = await req.json();
    const {
        mode,
        topic,
        existingQAs = [],
        allQAs = [],
        scratchpad,
        contextDocMd,
        directoryTree,
        allDocs = [],
        convexToken,
    } = body;

    // ── Mode: generateQuestions ─────────────────────────────────────────────────
    if (mode === 'generateQuestions') {
        const qaHistory =
            existingQAs.length > 0
                ? `## Questions & Answers So Far\n${(existingQAs as { question: string; answer: string }[])
                    .map((qa) => `**Q:** ${qa.question}\n**A:** ${qa.answer}`)
                    .join('\n\n')}`
                : '';

        const systemPrompt = [
            `You are an expert document strategist participating in Step 1 of a 3-step 'Wing It' pipeline.`,
            `The 'Wing It' pipeline collaboratively creates a document from minimal user input:`,
            ` - Step 1 (Questioning): Gather context by asking clarifying questions.`,
            ` - Step 2 (Research): Deeply research the topic based on the gathered context.`,
            ` - Step 3 (Writing): Write the final document based on the research.`,
            ``,
            `You are currently in Step 1 (Questioning). Gather context about a document by asking targeted clarifying questions in batches of 2-3.`,
            `You have tools available — use webSearch or extractContent ONLY for basic information retrieval required to decide what questions to ask. DO NOT perform deep or exhaustive research, as that is the specific job of Step 2.`,
            ``,
            `When ready, ALWAYS call the \`submitQuestions\` tool (never output text directly):`,
            `- \`done: true\` + empty array — use this whenever you feel you have sufficient context. Don't over-ask. If the topic and existing answers give you a clear picture, signal done immediately.`,
            `- \`done: false\` + 2-3 questions — only if you genuinely need more information that the user hasn't already covered.`,
            ``,
            `For each question:`,
            `- Choose type "single" or "multiple" based on what fits best`,
            `- Provide 3-5 concrete, distinct options (the UI adds a free-text "Other" field automatically)`,
            `- Never repeat a question already answered`,
            contextDocMd ? `\n## Global Context\n${contextDocMd}` : '',
            directoryTree ? `\n## Workspace\n${directoryTree}` : '',
        ]
            .filter(Boolean)
            .join('\n');

        const userPrompt = `Topic: ${topic}\n\n${qaHistory}\n\nGenerate the next batch of questions (or done: true if enough context).`;

        return sseResponse(async (write) => {
            const result = streamText({
                model: openai('gpt-5.1'),
                system: systemPrompt,
                prompt: userPrompt,
                stopWhen: stepCountIs(10),
                tools: {
                    ...buildWorkspaceTools(allDocs, convexToken),
                    submitQuestions: tool({
                        description:
                            'Submit the next batch of clarifying questions, or signal that you have collected enough context to write.',
                        inputSchema: z.object({
                            done: z.boolean().describe('true = enough context gathered, ready to write'),
                            questions: z.array(
                                z.object({
                                    id: z.string(),
                                    text: z.string(),
                                    type: z.enum(['single', 'multiple']),
                                    options: z.array(z.string()).min(2).max(5),
                                })
                            ),
                        }),
                        execute: async (args) => args,
                    }),
                },
            });

            for await (const chunk of result.fullStream) {
                if (chunk.type === 'tool-call' && chunk.toolName !== 'submitQuestions') {
                    write({ type: 'tool_call', name: chunk.toolName });
                }
                if (chunk.type === 'tool-result' && chunk.toolName === 'submitQuestions') {
                    const res = chunk.output as { done: boolean; questions: unknown[] };
                    write({ type: 'questions', done: res.done, questions: res.questions });
                }
            }
        });
    }

    // ── Mode: research ──────────────────────────────────────────────────────────
    // Phase 2: AI researches the topic using tools and writes an internal scratchpad.
    // The scratchpad is never shown to the user — it feeds into writeDocument.
    if (mode === 'research') {
        const allQAsText = (allQAs as { question: string; answer: string }[])
            .map((qa) => `**Q:** ${qa.question}\n**A:** ${qa.answer}`)
            .join('\n\n');

        const systemPrompt = [
            `You are a research assistant participating in Step 2 of a 3-step 'Wing It' pipeline.`,
            `The 'Wing It' pipeline collaboratively creates a document from minimal user input:`,
            ` - Step 1 (Questioning): Gather context by asking clarifying questions.`,
            ` - Step 2 (Research): Deeply research the topic based on the gathered context.`,
            ` - Step 3 (Writing): Write the final document based on the research.`,
            ``,
            `You are currently in Step 2 (Research). The previous step has already gathered initial intent and answers from the user.`,
            `Given the topic, Q&A requirements, and workspace context:`,
            `1. Use your tools to perform deep, exhaustive research to gather any information you need (web searches, reading URLs, reading workspace documents).`,
            `2. Synthesize everything into a comprehensive written research brief.`,
            `3. Include: key facts, data points, structural suggestions, tone guidance, relevant examples.`,
            ``,
            `Output your findings as clean markdown prose. Do NOT write the final formatted document.`,
            `Focus on depth of research and organizing raw material for a writer agent to use.`,
            contextDocMd ? `\n## Global Context\n${contextDocMd}` : '',
            directoryTree ? `\n## Workspace Structure\n${directoryTree}` : '',
            ``,
            `## Document Requirements`,
            `Topic: ${topic}`,
            ``,
            allQAsText,
        ]
            .filter(Boolean)
            .join('\n');

        return sseResponse(async (write) => {
            const result = streamText({
                model: openai('gpt-5.1'),
                system: systemPrompt,
                prompt: 'Research the topic thoroughly and write your findings.',
                stopWhen: stepCountIs(20),
                tools: buildWorkspaceTools(allDocs, convexToken),
            });

            let isThinking = false;

            for await (const chunk of result.fullStream) {
                if (chunk.type === 'tool-call') {
                    // Stop any thinking indicator when a tool call starts
                    if (isThinking) {
                        isThinking = false;
                        write({ type: 'thinking', active: false });
                    }
                    // Emit tool call with unique ID + args summary for the activity feed
                    const argSummary = chunk.input
                        ? Object.values(chunk.input as Record<string, unknown>)[0]
                        : '';
                    write({
                        type: 'tool_call',
                        id: chunk.toolCallId,
                        name: chunk.toolName,
                        args: typeof argSummary === 'string' ? argSummary : JSON.stringify(argSummary),
                    });
                } else if (chunk.type === 'tool-result') {
                    // Signal completion using the same unique ID
                    write({ type: 'tool_done', id: chunk.toolCallId, name: chunk.toolName });
                } else if (chunk.type === 'text-delta' && chunk.text) {
                    // Show thinking indicator when the model is writing to its scratchpad
                    if (!isThinking) {
                        isThinking = true;
                        write({ type: 'thinking', active: true });
                    }
                    // Accumulate scratchpad (not shown to user, but tracked server-side)
                    write({ type: 'text', content: chunk.text });
                }
            };
        });
    }

    // ── Mode: writeDocument ─────────────────────────────────────────────────────
    // Phase 3: Pure writing — no tools. Takes the scratchpad and writes the final
    // document. Output streams directly into the editor.
    if (mode === 'writeDocument') {
        const allQAsText = (allQAs as { question: string; answer: string }[])
            .map((qa) => `**Q:** ${qa.question}\n**A:** ${qa.answer}`)
            .join('\n\n');

        const systemPrompt = [
            `You are Lemma AI, an expert writing assistant participating in Step 3 of a 3-step 'Wing It' pipeline.`,
            `The 'Wing It' pipeline collaboratively creates a document from minimal user input:`,
            ` - Step 1 (Questioning): Gather context by asking clarifying questions.`,
            ` - Step 2 (Research): Deeply research the topic based on the gathered context.`,
            ` - Step 3 (Writing): Write the final document based on the research.`,
            ``,
            `You are currently in Step 3 (Writing). The previous steps have already gathered user intent and performed the deep research for you.`,
            `Using the research brief below, write a complete, high-quality document as clean Markdown.`,
            `Use appropriate structure: headers, sub-sections, lists, tables where data fits.`,
            ``,
            `CRITICAL RULES:`,
            `- Do not output ANY text before the document starts. Begin immediately with the first heading or paragraph.`,
            `- No preamble, no meta-commentary, no "Here is the document:" phrases.`,
            `- Use at most ONE level of list nesting. Never put a list inside another list.`,
            `- For hierarchical content, use sub-headings (###, ####) instead of nested lists.`,
            `- Bullet lists should be flat: each item is a single bullet, no children bullets.`,
            `- LENGTH: Keep the document concise. Target 300-500 words. Maximum 6 top-level sections.`,
            `- QUALITY OVER QUANTITY: A tight, focused 400-word document beats a sprawling 2000-word one.`,
            `- Stop when the document is complete. Do NOT pad with summaries, closing remarks, or extra sections.`,
            `- You have the ability to draw diagrams! Whenever you are writing PM documents, PRDs, system architectures, or complex logical flows, proactively generate diagrams to make the document better. To draw a diagram, output a standard markdown code block with the language set to \`mermaid\`. Be highly visual and use flowcharts, sequence diagrams, and state diagrams whenever they would add value.`,
            `- IMPORTANT (MERMAID SYNTAX): ALWAYS enclose flowchart node text in double quotes (e.g., A["Text (with parentheses)"] --> B["Step!"]) to prevent syntax errors from special characters like parentheses.`,
            contextDocMd ? `\n## Global Context\n${contextDocMd}` : '',
            ``,
            `## Research Brief`,
            scratchpad || '(No research brief provided — use your knowledge.)',
            ``,
            `## Document Requirements`,
            `Topic: ${topic}`,
            ``,
            allQAsText,
        ]
            .filter(Boolean)
            .join('\n');

        return sseResponse(async (write) => {
            const result = streamText({
                model: openai('gpt-5.1'),
                system: systemPrompt,
                prompt: 'Write the complete document now.',
                // No tools — pure generation
            });

            for await (const chunk of result.fullStream) {
                if (chunk.type === 'text-delta' && chunk.text) {
                    write({ type: 'text', content: chunk.text });
                }
            }
        });
    }

    return new Response(JSON.stringify({ error: 'Invalid mode' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
    });
}
