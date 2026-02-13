'use client';

import { Plate, usePlateEditor } from 'platejs/react';

import { BasicBlocksKit } from '@/components/editor/plugins/basic-blocks-kit';
import { BasicMarksKit } from '@/components/editor/plugins/basic-marks-kit';
import { BlockSelectionKit } from '@/components/editor/plugins/block-selection-kit';
import { CalloutKit } from '@/components/editor/plugins/callout-kit';
import { CodeBlockKit } from '@/components/editor/plugins/code-block-kit';
import { DndKit } from '@/components/editor/plugins/dnd-kit';
import { FixedToolbarKit } from '@/components/editor/plugins/fixed-toolbar-kit';
import { MarkdownKit } from '@/components/editor/plugins/markdown-kit';
import { FloatingToolbarKit } from '@/components/editor/plugins/floating-toolbar-kit';
import { LinkKit } from '@/components/editor/plugins/link-kit';
import { ListKit } from '@/components/editor/plugins/list-kit';
import { SlashKit } from '@/components/editor/plugins/slash-kit';
import { TableKit } from '@/components/editor/plugins/table-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';

const STORAGE_KEY = 'thinkos-doc';

export default function Page() {
  const editor = usePlateEditor({
    plugins: [
      ...BasicBlocksKit,
      ...BasicMarksKit,
      ...LinkKit,
      ...ListKit,
      ...TableKit,
      ...CodeBlockKit,
      ...CalloutKit,
      ...FixedToolbarKit,
      ...FloatingToolbarKit,
      ...SlashKit,
      ...BlockSelectionKit,
      ...DndKit,
      ...MarkdownKit,
    ],
    value: () => {
      if (typeof window === 'undefined') return undefined;
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : undefined;
    },
  });

  return (
    <Plate
      editor={editor}
      onChange={({ value }) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      }}
    >
      <EditorContainer>
        <Editor placeholder="Start writing..." />
      </EditorContainer>
    </Plate>
  );
}
