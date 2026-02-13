'use client';

import { AppSidebar } from '@/components/app/app-sidebar';
import { DocumentEditor } from '@/components/app/document-editor';
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { PanelLeft } from 'lucide-react';

export default function Page() {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset>
        <MainContent />
      </SidebarInset>
    </SidebarProvider>
  );
}

function MainContent() {
  const { open } = useSidebar();

  return (
    <>
      {!open && (
        <div className="flex h-10 items-center px-2 border-b">
          <SidebarTrigger>
            <PanelLeft className="size-4" />
          </SidebarTrigger>
        </div>
      )}
      <DocumentEditor />
    </>
  );
}
