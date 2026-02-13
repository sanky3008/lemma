'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UIMessage } from 'ai';
import {
  Bot,
  Globe,
  FileText,
  Pencil,
  HelpCircle,
  MessageSquarePlus,
  Send,
  Trash2,
  X,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { useChatStore } from '@/lib/ai/chat-store';
import { useDocStore } from '@/lib/doc-store';
import { Button } from '@/components/ui/button';

const toolIcons: Record<string, React.ReactNode> = {
  webSearch: <Globe className="size-3.5" />,
  extractContent: <Globe className="size-3.5" />,
  readPage: <FileText className="size-3.5" />,
  editDocument: <Pencil className="size-3.5" />,
  askQuestion: <HelpCircle className="size-3.5" />,
};

const toolLabels: Record<string, string> = {
  webSearch: 'Searching the web',
  extractContent: 'Reading webpage',
  readPage: 'Reading document',
  editDocument: 'Editing document',
  askQuestion: 'Asking question',
};

function isToolPart(part: any): boolean {
  return part.type === 'dynamic-tool' || part.type?.startsWith('tool-');
}

function getToolName(part: any): string {
  if (part.type === 'dynamic-tool') return part.toolName || '';
  // Typed tool parts have type "tool-{name}"
  if (part.type?.startsWith('tool-')) return part.type.slice(5);
  return '';
}

function ToolInvocationPart({ part }: { part: any }) {
  const name = getToolName(part);
  const state = part.state;

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
      {toolIcons[name] || <Bot className="size-3.5" />}
      <span>{toolLabels[name] || name}</span>
      {(state === 'input-streaming' || state === 'input-available') && (
        <Loader2 className="size-3 animate-spin" />
      )}
      {state === 'output-available' && <span className="text-green-600">done</span>}
    </div>
  );
}

function QuestionFromTool({
  output,
  onAnswer,
}: {
  output: { question: string; options: string[] };
  onAnswer: (answer: string) => void;
}) {
  const [customText, setCustomText] = useState('');

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <p className="text-sm font-medium">{output.question}</p>
      <div className="flex flex-wrap gap-1.5">
        {output.options.map((option: string) => (
          <button
            key={option}
            onClick={() => onAnswer(option)}
            className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-accent transition-colors"
          >
            {option}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder="Or type a custom answer..."
          className="flex-1 rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customText.trim()) {
              onAnswer(customText.trim());
            }
          }}
        />
        {customText.trim() && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2"
            onClick={() => onAnswer(customText.trim())}
          >
            <Send className="size-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function MessageItem({
  message,
  onAnswer,
}: {
  message: UIMessage;
  onAnswer: (answer: string) => void;
}) {
  if (message.role === 'user') {
    const textParts = message.parts.filter((p) => p.type === 'text');
    const text = textParts.map((p) => (p as { text: string }).text).join('');
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          {text}
        </div>
      </div>
    );
  }

  // Assistant message
  let editCount = 0;

  return (
    <div className="space-y-1.5">
      {message.parts.map((part, i) => {
        if (part.type === 'text' && part.text) {
          return (
            <div
              key={i}
              className="prose prose-sm max-w-none text-sm dark:prose-invert [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:my-1 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {part.text}
              </ReactMarkdown>
            </div>
          );
        }

        if (isToolPart(part)) {
          const toolPart = part as any;
          const toolName = getToolName(toolPart);

          // Count edits
          if (
            toolName === 'editDocument' &&
            toolPart.state === 'output-available'
          ) {
            editCount++;
          }

          // Show question form for askQuestion tool
          if (
            toolName === 'askQuestion' &&
            toolPart.state === 'output-available' &&
            toolPart.output?.type === 'question'
          ) {
            return (
              <QuestionFromTool
                key={i}
                output={toolPart.output}
                onAnswer={onAnswer}
              />
            );
          }

          return <ToolInvocationPart key={i} part={toolPart} />;
        }

        // Skip step-start and other non-renderable parts
        return null;
      })}

      {editCount > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Pencil className="size-3" />
          <span>
            {editCount} edit{editCount > 1 ? 's' : ''} applied
          </span>
        </div>
      )}
    </div>
  );
}

export function AIChatSidebar({ onClose }: { onClose: () => void }) {
  const {
    threadMetas,
    activeThreadId,
    messages,
    status,
    selectedText,
    setSelectedText,
    createThread,
    switchThread,
    deleteThread,
    sendMessage,
  } = useChatStore();
  const { getActiveDoc } = useDocStore();
  const activeDoc = getActiveDoc();

  const [input, setInput] = useState('');
  const [showThreadPicker, setShowThreadPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = status === 'streaming' || status === 'submitted';
  const activeThreadMeta = threadMetas.find((t) => t.id === activeThreadId);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    sendMessage(text);
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleAnswer = useCallback(
    (answer: string) => {
      sendMessage(answer);
    },
    [sendMessage]
  );

  return (
    <div className="flex h-full flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 p-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Bot className="size-4 text-primary shrink-0" />
          <div className="relative min-w-0 flex-1">
            <button
              onClick={() => setShowThreadPicker(!showThreadPicker)}
              className="flex items-center gap-1 text-sm font-medium hover:text-muted-foreground max-w-full"
            >
              <span className="truncate">{activeThreadMeta?.title ?? 'AI Chat'}</span>
              <ChevronDown className="size-3 shrink-0" />
            </button>
            {showThreadPicker && (
              <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border bg-popover p-1 shadow-md">
                <button
                  onClick={() => {
                    createThread();
                    setShowThreadPicker(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                >
                  <MessageSquarePlus className="size-3.5" />
                  New Chat
                </button>
                {threadMetas.length > 0 && <div className="my-1 border-t" />}
                {threadMetas.map((thread) => (
                  <div
                    key={thread.id}
                    className="group flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                  >
                    <button
                      className="flex-1 truncate text-left"
                      onClick={() => {
                        switchThread(thread.id);
                        setShowThreadPicker(false);
                      }}
                    >
                      {thread.title}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteThread(thread.id);
                      }}
                      className="hidden text-muted-foreground hover:text-destructive group-hover:block"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => createThread()}
            title="New chat"
          >
            <MessageSquarePlus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 pt-12 text-center text-muted-foreground">
            <Bot className="size-8 opacity-30" />
            <p className="text-sm">Ask me anything about your PRD</p>
            <p className="text-xs">
              I can search the web, read your docs, and make edits
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} onAnswer={handleAnswer} />
        ))}

        {/* Streaming indicator */}
        {isStreaming &&
          messages.length > 0 &&
          !messages[messages.length - 1]?.parts?.some(
            (p) => p.type === 'text' && (p as any).text
          ) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
      </div>

      {/* Context chips */}
      {(activeDoc || selectedText) && (
        <div className="flex flex-wrap gap-1 border-t px-3 py-1.5">
          {activeDoc && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {activeDoc.title}
            </span>
          )}
          {selectedText && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              Selection
              <button
                onClick={() => setSelectedText('')}
                className="hover:text-foreground"
              >
                <X className="size-2.5" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Lemma AI..."
            rows={1}
            className="max-h-32 min-h-[36px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            style={{
              height: 'auto',
              overflow: 'hidden',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 128) + 'px';
            }}
          />
          <Button
            size="sm"
            className="h-9 w-9 shrink-0 p-0"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
