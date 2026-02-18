import { openai } from '@ai-sdk/openai';
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai';
import { z } from 'zod';

import { buildSystemPrompt } from '@/lib/ai/system-prompt';

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const { messages, context } = body;

  // Convert UIMessages to ModelMessages
  const modelMessages = await convertToModelMessages(messages);

  const systemPrompt = buildSystemPrompt({
    contextDocMd: context?.contextDocMd ?? null,
    directoryTree: context?.directoryTree ?? '',
    activeDocId: context?.activeDocId ?? null,
    activeDocAnnotatedMd: context?.activeDocAnnotatedMd ?? null,
    activeDocXml: context?.activeDocXml ?? null,
    activeDocTitle: context?.activeDocTitle ?? null,
    selectedText: context?.selectedText,
  });

  const allDocs: { id: string; title: string; folderId?: string }[] =
    context?.allDocs ?? [];

  const result = streamText({
    model: openai('gpt-5.1'),
    system: systemPrompt,
    messages: modelMessages,
    stopWhen: stepCountIs(10),
    tools: {
      webSearch: tool({
        description:
          'Search the web for current information. Use this when the user asks about recent events, statistics, tools, or anything that may require up-to-date data.',
        inputSchema: z.object({
          query: z.string().describe('The search query'),
        }),
        execute: async ({ query }) => {
          const apiKey = process.env.TAVILY_API_KEY;
          if (!apiKey) {
            return { error: 'Tavily API key not configured' };
          }
          const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: apiKey,
              query,
              max_results: 5,
              include_answer: true,
            }),
          });
          const data = await res.json();
          return {
            answer: (data.answer as string) || '',
            results: ((data.results || []) as { title: string; url: string; content: string }[]).map(
              (r) => ({
                title: r.title,
                url: r.url,
                snippet: r.content?.substring(0, 300) || '',
              })
            ),
          };
        },
      }),

      extractContent: tool({
        description:
          'Extract detailed content from a URL. Use this to read web pages, articles, documentation, etc.',
        inputSchema: z.object({
          url: z.string().url().describe('The URL to extract content from'),
        }),
        execute: async ({ url }) => {
          const apiKey = process.env.TAVILY_API_KEY;
          if (!apiKey) {
            return { url, content: 'Tavily API key not configured' };
          }
          const res = await fetch('https://api.tavily.com/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: apiKey,
              urls: [url],
            }),
          });
          const data = await res.json();
          const extracted = data.results?.[0];
          return {
            url: extracted?.url || url,
            content: extracted?.raw_content?.substring(0, 5000) || 'No content extracted',
          };
        },
      }),

      readPage: tool({
        description:
          'Read a document from the user\'s workspace by its title. Returns the document content as annotated markdown with block IDs. Note: Only the currently active document\'s full content is available. For other documents, ask the user to open them first.',
        inputSchema: z.object({
          title: z.string().describe('The title of the document to read'),
        }),
        execute: async ({ title }) => {
          const doc = allDocs.find(
            (d) => d.title.toLowerCase() === title.toLowerCase()
          );
          if (!doc) {
            const available = allDocs.map((d) => d.title).join(', ');
            return {
              docId: '',
              title,
              content: `Document "${title}" not found. Available documents: ${available}`,
            };
          }
          // If this is the active document, use the pre-serialized annotated markdown
          const activeDocId = context?.activeDocId;
          if (doc.id === activeDocId && context?.activeDocAnnotatedMd) {
            return {
              docId: doc.id,
              title: doc.title,
              content: context.activeDocAnnotatedMd,
            };
          }
          // Non-active documents: content is not available without fetching
          return {
            docId: doc.id,
            title: doc.title,
            content: `This document is not currently open. The active document's content is already provided in your context. Ask the user to open "${doc.title}" if they need you to read or edit it.`,
          };
        },
      }),

      editDocument: tool({
        description: `Edit the active document or create a new document. You can ONLY edit the document the user is currently viewing. Two modes:
- "single": Edit a single block (replace, insertAfter, insertBefore, or delete)
- "range": Replace a range of blocks from startBlockId to endBlockId
- "newFile": Create a new document

IMPORTANT: For single/range edits, you may only edit the active document. Do NOT attempt to edit other documents — if the user asks, tell them to open that document first.`,
        inputSchema: z.object({
          mode: z.enum(['single', 'range', 'newFile']),
          docId: z.string().optional().describe('Document ID (required for single/range modes — must be the active document)'),
          blockId: z.string().optional().describe('Block ID for single mode'),
          action: z
            .enum(['replace', 'insertAfter', 'insertBefore', 'delete'])
            .optional()
            .describe('Action for single mode'),
          startBlockId: z.string().optional().describe('Start block ID for range mode'),
          endBlockId: z.string().optional().describe('End block ID for range mode'),
          markdown: z.string().optional().describe('Markdown content for the edit'),
          title: z.string().optional().describe('Title for newFile mode'),
          folderId: z.string().optional().describe('Folder ID for newFile mode'),
        }),
        execute: async (params) => {
          // Enforce: single/range edits can only target the active document
          const activeDocId = context?.activeDocId;
          if (
            (params.mode === 'single' || params.mode === 'range') &&
            params.docId &&
            activeDocId &&
            params.docId !== activeDocId
          ) {
            return {
              type: 'error' as const,
              error: `Cannot edit document "${params.docId}" because it is not the active document. Only the currently open document can be edited. Ask the user to navigate to that document first.`,
            };
          }

          return {
            type: 'edit' as const,
            instruction: {
              mode: params.mode,
              docId: params.docId,
              blockId: params.blockId,
              action: params.action,
              startBlockId: params.startBlockId,
              endBlockId: params.endBlockId,
              markdown: params.markdown,
              title: params.title,
              folderId: params.folderId,
            },
          };
        },
      }),

      askQuestion: tool({
        description:
          'Ask the user clarifying questions using a structured interface. Use this when you need more information or specific requirements before proceeding. You can ask multiple related questions in one turn.',
        inputSchema: z.object({
          questions: z.array(z.object({
            id: z.string().describe('Unique identifier for this question'),
            text: z.string().describe('The question text'),
            type: z.enum(['single', 'multiple']).describe('Whether the user can pick one or multiple options'),
            options: z.array(z.string()).describe('Available choices'),
          })).min(1),
        }),
        execute: async ({ questions }) => {
          return {
            type: 'question' as const,
            questions,
          };
        },
      }),

      resolveComment: tool({
        description: 'Resolve a comment discussion in the active document. Use this when the user asks to resolve a comment or when you have addressed the feedback in a comment. The comment ID is required.',
        inputSchema: z.object({
          commentId: z.string().describe('The ID of the comment/thread to resolve (shown in the document XML or Comments Detail)'),
        }),
        execute: async ({ commentId }) => {
          const { ConvexHttpClient } = await import('convex/browser');
          const { api } = await import('../../../../../convex/_generated/api');

          const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

          try {
            // commentId is the discussionId (matches the <comment id="..."> in the XML and Comments Detail)
            await client.mutation(api.comments.resolve, { discussionId: commentId });
            return { success: true, message: `Resolved comment thread ${commentId}` };
          } catch (error: any) {
            return { error: `Failed to resolve comment: ${error.message}` };
          }
        },
      }),

    },
  });

  return result.toUIMessageStreamResponse();
}
