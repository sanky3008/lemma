'use client';

import * as React from 'react';

import { MessageSquareTextIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { commentPlugin } from '@/components/editor/plugins/comment-kit';

import { ToolbarButton } from './toolbar';

export function CommentToolbarButton() {
  const editor = useEditorRef();

  return (
    <ToolbarButton
      onClick={() => {
        editor.getTransforms(commentPlugin).comment.setDraft();
      }}
      onMouseDown={(e) => e.preventDefault()}
      data-plate-prevent-overlay
      tooltip="Comment"
    >
      <MessageSquareTextIcon />
    </ToolbarButton>
  );
}
