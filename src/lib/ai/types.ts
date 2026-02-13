export type EditMode = 'single' | 'range' | 'newFile';

export type EditInstruction = {
  mode: 'single';
  docId: string;
  blockId: string;
  action: 'replace' | 'insertAfter' | 'insertBefore' | 'delete';
  markdown?: string;
} | {
  mode: 'range';
  docId: string;
  startBlockId: string;
  endBlockId: string;
  markdown: string;
} | {
  mode: 'newFile';
  title: string;
  folderId?: string;
  markdown: string;
};

export type AskQuestionPayload = {
  question: string;
  options: string[];
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallInfo[];
  edits?: EditInstruction[];
  question?: AskQuestionPayload;
  createdAt: number;
};

export type ToolCallInfo = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'done' | 'error';
  result?: string;
};

export type ChatThread = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export type ChatRequest = {
  messages: { role: 'user' | 'assistant'; content: string }[];
  context: {
    activeDocId: string | null;
    activeDocAnnotatedMd: string | null;
    activeDocTitle: string | null;
    contextDocMd: string | null;
    directoryTree: string;
    allDocs: { id: string; title: string; folderId?: string; content: any[] }[];
    selectedText?: string;
  };
};
