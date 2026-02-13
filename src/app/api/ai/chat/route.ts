import { openai } from '@ai-sdk/openai';
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai';
import { z } from 'zod';

import { buildSystemPrompt } from '@/lib/ai/system-prompt';
import {
  createMarkdownEditor,
  serializeToAnnotatedMarkdown,
} from '@/lib/ai/serialize';

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const { messages, context } = body;

  console.log('Received messages:', JSON.stringify(messages, null, 2));

  // Convert UIMessages to ModelMessages
  const modelMessages = await convertToModelMessages(messages);

  console.log('Converted messages:', JSON.stringify(modelMessages, null, 2));

  const systemPrompt = buildSystemPrompt({
    contextDocMd: context?.contextDocMd ?? null,
    directoryTree: context?.directoryTree ?? '',
    activeDocId: context?.activeDocId ?? null,
    activeDocAnnotatedMd: context?.activeDocAnnotatedMd ?? null,
    activeDocTitle: context?.activeDocTitle ?? null,
    selectedText: context?.selectedText,
  });

  const allDocs: { id: string; title: string; folderId?: string; content: any[] }[] =
    context?.allDocs ?? [];

  const result = streamText({
    model: openai('gpt-4.1'),
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
          'Read a document from the user\'s workspace by its title. Returns the document content as annotated markdown with block IDs.',
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
          const editor = createMarkdownEditor();
          const annotatedMd = serializeToAnnotatedMarkdown(editor, doc.content);
          return {
            docId: doc.id,
            title: doc.title,
            content: annotatedMd,
          };
        },
      }),

      editDocument: tool({
        description: `Edit a document in the user's workspace. Three modes:
- "single": Edit a single block (replace, insertAfter, insertBefore, or delete)
- "range": Replace a range of blocks from startBlockId to endBlockId
- "newFile": Create a new document

For single/range edits on the active document, use the block IDs from the active document content. For edits to other documents, first use readPage to get the block IDs.`,
        inputSchema: z.object({
          mode: z.enum(['single', 'range', 'newFile']),
          docId: z.string().optional().describe('Document ID (required for single/range modes)'),
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
          // Return the edit instruction for client-side application
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
          'Ask the user a clarifying question with multiple-choice options. Use this when you need more information before proceeding.',
        inputSchema: z.object({
          question: z.string().describe('The question to ask'),
          options: z.array(z.string()).describe('Available options for the user to choose from'),
        }),
        execute: async ({ question, options }) => {
          return {
            type: 'question' as const,
            question,
            options,
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
