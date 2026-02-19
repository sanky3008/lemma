'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppSidebar } from '@/components/app/app-sidebar';
import { AIChatSidebar } from '@/components/app/ai-chat-sidebar';
import { DocumentEditor } from '@/components/app/document-editor';
import { ChatStoreProvider } from '@/lib/ai/chat-store';
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { PanelLeft } from 'lucide-react';

const AI_SIDEBAR_DEFAULT_WIDTH = 400;
const AI_SIDEBAR_MIN_WIDTH = 260;
const AI_SIDEBAR_MAX_WIDTH = 800;

export default function Page() {
  return (
    <ChatStoreProvider>
      <SidebarProvider defaultOpen={true} className="h-screen">
        <AppSidebar />
        <SidebarInset className="overflow-hidden">
          <MainContent />
        </SidebarInset>
      </SidebarProvider>
    </ChatStoreProvider>
  );
}

function MainContent() {
  const { open } = useSidebar();
  const [aiSidebarOpen, setAiSidebarOpen] = useState(true);
  const [aiSidebarWidth, setAiSidebarWidth] = useState(AI_SIDEBAR_DEFAULT_WIDTH);
  const isResizingRef = useRef(false);

  const toggleAiSidebar = useCallback(() => {
    setAiSidebarOpen((prev) => !prev);
  }, []);

  // Cmd+L keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'l' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleAiSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleAiSidebar]);

  const handleAiResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      const startX = e.clientX;
      const startWidth = aiSidebarWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizingRef.current) return;
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.min(
          AI_SIDEBAR_MAX_WIDTH,
          Math.max(AI_SIDEBAR_MIN_WIDTH, startWidth + delta)
        );
        setAiSidebarWidth(newWidth);
      };

      const onMouseUp = () => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [aiSidebarWidth]
  );

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {!open && (
          <div className="flex h-10 items-center px-2 border-b">
            <SidebarTrigger>
              <PanelLeft className="size-4" />
            </SidebarTrigger>
          </div>
        )}
        <DocumentEditor
          onAIClick={() => setAiSidebarOpen(true)}
          aiSidebarOpen={aiSidebarOpen}
        />
      </div>
      {aiSidebarOpen && (
        <>
          {/* Drag handle */}
          <div
            onMouseDown={handleAiResizeStart}
            className="w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors shrink-0"
          />
          <div style={{ width: aiSidebarWidth }}>
            <AIChatSidebar onClose={() => setAiSidebarOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
