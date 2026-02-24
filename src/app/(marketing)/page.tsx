import Link from 'next/link';
import { createSlateEditor } from 'platejs';
import { BaseEditorKit } from '@/components/editor/editor-base-kit';
import { EditorStatic } from '@/components/ui/editor-static';
import { landingContent } from '@/lib/landing-content';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lemma \u2014 PRD Writing Tool for Product Managers',
  description:
    'Write better PRDs faster with an AI-powered editor built for product managers. Rich formatting, context-aware AI, and automated research.',
};

export default function LandingPage() {
  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    value: landingContent,
  });

  return (
    <div className="mx-auto max-w-[700px] px-6">
      <EditorStatic editor={editor} variant="none" className="pt-8 pb-16" />
      <div className="flex flex-col items-center gap-4 border-t py-16">
        <h2 className="text-2xl font-semibold">Ready to write better PRDs?</h2>
        <p className="text-muted-foreground text-center">
          Sign up for free and start shipping better specs today.
        </p>
        <Link
          href="/sign-up"
          className="inline-flex h-10 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Get started for free
        </Link>
      </div>
    </div>
  );
}
