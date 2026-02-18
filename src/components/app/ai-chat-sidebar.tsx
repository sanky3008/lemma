import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Check,
} from 'lucide-react';
import { useChatStore, useChatStream } from '@/lib/ai/chat-store';
import { useDocStore } from '@/lib/doc-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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

interface Question {
  id: string;
  text: string;
  type: 'single' | 'multiple';
  options: string[];
}

function QuestionFromTool({
  output,
  onAnswer,
}: {
  output: { questions: Question[] };
  onAnswer: (answer: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  const isComplete = useMemo(() => {
    return output.questions.every((q) => {
      const ans = answers[q.id];
      if (q.type === 'single') return !!ans;
      if (q.type === 'multiple') return Array.isArray(ans) && ans.length > 0;
      return false;
    });
  }, [output.questions, answers]);

  const toggleOption = (qId: string, option: string) => {
    setAnswers((prev) => {
      const current = (prev[qId] as string[]) || [];
      if (current.includes(option)) {
        return { ...prev, [qId]: current.filter((o) => o !== option) };
      }
      return { ...prev, [qId]: [...current, option] };
    });
  };

  const handleReply = () => {
    if (!isComplete) return;

    const summary = output.questions
      .map((q) => {
        let text = answers[q.id];
        if (Array.isArray(text)) text = text.join(', ');
        const custom = customAnswers[q.id];
        return `${q.text}\nAnswer: ${text}${custom ? ` (Custom: ${custom})` : ''}`;
      })
      .join('\n\n');

    onAnswer(summary);
  };

  return (
    <Card className="border-primary/20 bg-muted/30 shadow-sm overflow-hidden mb-4">
      <CardHeader className="flex flex-row items-center gap-2 p-3 pb-2 space-y-0">
        <div className="bg-primary/10 p-1.5 rounded-full">
          <HelpCircle className="size-4 text-primary" />
        </div>
        <CardTitle className="text-xs font-semibold tracking-tight text-primary uppercase">
          Clarification Needed
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-4">
        {output.questions.map((q) => (
          <div key={q.id} className="space-y-2.5">
            <p className="text-sm font-medium leading-snug">{q.text}</p>

            {q.type === 'single' ? (
              <RadioGroup
                value={answers[q.id] as string}
                onValueChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
                className="grid grid-cols-1 gap-2"
              >
                {q.options.map((opt) => (
                  <div key={opt} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt} id={`${q.id}-${opt}`} className="size-4" />
                    <Label
                      htmlFor={`${q.id}-${opt}`}
                      className="text-xs font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer py-1 block w-full"
                    >
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {q.options.map((opt) => {
                  const isChecked = (answers[q.id] as string[])?.includes(opt);
                  return (
                    <div key={opt} className="flex items-center space-x-2">
                      <Checkbox
                        id={`${q.id}-${opt}`}
                        checked={isChecked}
                        onCheckedChange={() => toggleOption(q.id, opt)}
                        className="size-4"
                      />
                      <Label
                        htmlFor={`${q.id}-${opt}`}
                        className="text-xs font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer py-1 block w-full"
                      >
                        {opt}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-1">
              <Input
                placeholder="Other details (optional)..."
                value={customAnswers[q.id] || ''}
                onChange={(e) => setCustomAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                className="h-8 text-xs bg-background/50 border-dashed"
              />
            </div>
          </div>
        ))}

        <Button
          onClick={handleReply}
          disabled={!isComplete}
          className="w-full h-8 text-xs font-medium gap-1.5 mt-2"
        >
          <Check className="size-3.5" />
          Submit Clarifications
        </Button>
      </CardContent>
    </Card>
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
              className="text-sm [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_pre]:my-1 [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-xs [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:my-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:my-1 [&_h3]:text-sm [&_h3]:font-medium [&_strong]:font-semibold [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
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
    selectedText,
    setSelectedText,
    createThread,
    switchThread,
    deleteThread,
    sendMessage,
  } = useChatStore();
  const { messages, status } = useChatStream();
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
