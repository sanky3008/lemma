'use client';

import * as React from 'react';

import {
  BoldIcon,
  Code2Icon,
  ItalicIcon,
  BotIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorReadOnly, useEditorRef } from 'platejs/react';

import { useChatStore } from '@/lib/ai/chat-store';
import { useDocStore } from '@/lib/doc-store';

import { LinkToolbarButton } from './link-toolbar-button';
import { CommentToolbarButton } from './comment-toolbar-button';
import { MarkToolbarButton } from './mark-toolbar-button';
import { MoreToolbarButton } from './more-toolbar-button';
import { ToolbarButton, ToolbarGroup } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-button';

function AddToContextButton() {
  const editor = useEditorRef();
  const { addContextSnippet } = useChatStore();
  const { getActiveDoc } = useDocStore();

  return (
    <ToolbarButton
      tooltip="Add to AI Context (⌘J)"
      onClick={() => {
        const selection = editor.selection;
        if (!selection) return;
        const text = editor.api.string(selection);
        if (!text) return;
        const doc = getActiveDoc();
        if (!doc) return;
        addContextSnippet(doc.id, doc.title, text);
      }}
    >
      <BotIcon />
    </ToolbarButton>
  );
}

export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly();

  return (
    <>
      {!readOnly && (
        <>
          <ToolbarGroup>
            <TurnIntoToolbarButton />

            <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
              <BoldIcon />
            </MarkToolbarButton>

            <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
              <ItalicIcon />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.underline}
              tooltip="Underline (⌘+U)"
            >
              <UnderlineIcon />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.strikethrough}
              tooltip="Strikethrough (⌘+⇧+M)"
            >
              <StrikethroughIcon />
            </MarkToolbarButton>

            <MarkToolbarButton nodeType={KEYS.code} tooltip="Code (⌘+E)">
              <Code2Icon />
            </MarkToolbarButton>

            <LinkToolbarButton />
            <CommentToolbarButton />
            <AddToContextButton />
          </ToolbarGroup>
        </>
      )}

      <ToolbarGroup>
        {!readOnly && <MoreToolbarButton />}
      </ToolbarGroup>
    </>
  );
}
