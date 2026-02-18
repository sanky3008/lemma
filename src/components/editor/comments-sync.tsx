'use client';

import { useEffect, useRef } from 'react';
import { useEditorRef } from 'platejs/react';
import { useEditorPlugin } from 'platejs/react';
import { CommentPlugin } from '@platejs/comment/react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { discussionPlugin } from './plugins/discussion-kit';

export function CommentsSync({ docId }: { docId: string }) {
    const editor = useEditorRef();
    const { tf } = useEditorPlugin(CommentPlugin);
    const comments = useQuery(api.comments.list, { documentId: docId });
    // Track which discussionIds were previously unresolved so we can detect transitions
    const prevResolvedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!comments) return;

        const discussionsMap = new Map<string, any>();
        const usersMap: Record<string, any> = {};

        comments.forEach(c => {
            if (!discussionsMap.has(c.discussionId)) {
                discussionsMap.set(c.discussionId, {
                    id: c.discussionId,
                    comments: [],
                    createdAt: new Date(c.createdAt),
                    userId: c.userId,
                    isResolved: c.isResolved,
                    documentContent: c.context,
                });
            }

            const discussion = discussionsMap.get(c.discussionId);

            if (c.userInfo) {
                usersMap[c.userId] = {
                    id: c.userId,
                    name: c.userInfo.name,
                    avatarUrl: c.userInfo.image,
                };
            }

            discussion.comments.push({
                id: c.id,
                contentRich: c.content,
                createdAt: new Date(c.createdAt),
                discussionId: c.discussionId,
                isEdited: false,
                userId: c.userId,
            });
        });

        const discussions = Array.from(discussionsMap.values());

        // Remove highlight for any discussion that just became resolved
        for (const [discussionId, discussion] of discussionsMap) {
            if (discussion.isResolved && !prevResolvedRef.current.has(discussionId)) {
                tf.comment.unsetMark({ id: discussionId });
            }
        }
        prevResolvedRef.current = new Set(
            discussions.filter(d => d.isResolved).map(d => d.id)
        );

        editor.setOption(discussionPlugin, 'discussions', discussions);
        editor.setOption(discussionPlugin, 'users', usersMap);
        editor.setOption(discussionPlugin, 'documentId', docId);

    }, [comments, editor, docId, tf]);

    return null;
}
