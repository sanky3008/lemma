// Landing page content as Plate editor JSON nodes.
// Rendered via PlateStatic on the marketing page.

export const landingContent: any[] = [
  // ─── Hero ───
  {
    type: 'h1',
    children: [{ text: 'Lemma' }],
  },
  {
    type: 'p',
    children: [
      { text: 'The PRD writing tool for product managers who ship.', italic: true },
    ],
  },
  {
    type: 'hr',
    children: [{ text: '' }],
  },

  // ─── Problem ───
  {
    type: 'h2',
    children: [{ text: "PRDs shouldn't be painful" }],
  },
  {
    type: 'p',
    children: [
      {
        text: "You've tried writing PRDs in Google Docs. The formatting is manual, the structure is inconsistent, and there's no intelligence built in. You end up spending more time wrestling with the document than thinking about the product.",
      },
    ],
  },
  {
    type: 'p',
    children: [
      {
        text: "Lemma is different. It's a purpose-built editor for product requirements \u2014 with AI that actually understands your documents.",
      },
    ],
  },
  {
    type: 'callout',
    icon: '\uD83D\uDCA1',
    children: [
      {
        type: 'p',
        children: [
          {
            text: "Write structured PRDs with a rich editor, get AI help that understands your document's context, and go from idea to spec in minutes \u2014 not hours.",
          },
        ],
      },
    ],
  },

  // ─── What you get ───
  {
    type: 'h2',
    children: [{ text: 'What you get' }],
  },

  // --- A real editor ---
  {
    type: 'h3',
    children: [{ text: 'A real editor' }],
  },
  {
    type: 'p',
    children: [
      {
        text: 'Lemma gives you a full-featured document editor with everything you need for product specs. Headings, tables, callouts, code blocks, checklists, images, and more \u2014 all with keyboard shortcuts and slash commands.',
      },
    ],
  },
  {
    type: 'p',
    children: [
      {
        text: 'Organize your work in folders, upload existing docs (Markdown, HTML, or DOCX), and pick up right where you left off.',
      },
    ],
  },
  {
    type: 'img',
    url: '/landing/sidebar-upload.png',
    width: '100%',
    align: 'center',
    children: [{ text: '' }],
  },

  // --- AI that edits with you ---
  {
    type: 'h3',
    children: [{ text: 'AI that edits with you' }],
  },
  {
    type: 'p',
    children: [
      {
        text: "Lemma's AI sidebar isn't a generic chatbot. It sees your entire document, knows which paragraph you've selected, reads your comments, and makes targeted edits right where they belong.",
      },
    ],
  },
  {
    type: 'img',
    url: '/landing/dynamic-context.png',
    width: '100%',
    align: 'center',
    children: [{ text: '' }],
  },
  {
    type: 'p',
    children: [
      { text: 'Select a section, reference a comment, and ask: ' },
      {
        text: '"please resolve my comments. also, shorten the selected paragraph"',
        italic: true,
      },
      {
        text: ". The AI understands the context and applies precise edits \u2014 no copy-pasting needed.",
      },
    ],
  },

  // --- Wing It ---
  {
    type: 'h3',
    children: [{ text: 'Wing It: from zero to PRD' }],
  },
  {
    type: 'p',
    children: [
      {
        text: "Don't know where to start? Give Lemma a topic and hit ",
      },
      { text: 'Wing It', bold: true },
      {
        text: '. It researches the web, reads your existing docs for context, and drafts a complete PRD \u2014 structured with sections, success metrics, and technical considerations.',
      },
    ],
  },
  {
    type: 'img',
    url: '/landing/wing-it.png',
    width: '100%',
    align: 'center',
    children: [{ text: '' }],
  },
  {
    type: 'p',
    children: [
      {
        text: "You answer a few quick-fire questions, then sit back while the research agent reads documents, searches the web, and writes your first draft. It's a starting point \u2014 not a final product \u2014 and you can refine it with the AI sidebar from there.",
      },
    ],
  },

  // --- Context ---
  {
    type: 'h3',
    children: [{ text: 'Context that persists' }],
  },
  {
    type: 'p',
    children: [
      {
        text: 'Define your product\'s constraints, terminology, and background knowledge in a ',
      },
      { text: 'Context document', bold: true },
      {
        text: ". This acts as a universal set of rules underlying every AI operation across your workspace \u2014 so the AI always knows your product's domain.",
      },
    ],
  },
  {
    type: 'img',
    url: '/landing/context-doc.png',
    width: '100%',
    align: 'center',
    children: [{ text: '' }],
  },

  // ─── What's inside ───
  {
    type: 'h2',
    children: [{ text: "What's inside" }],
  },
  {
    type: 'table',
    colSizes: [200, 400],
    children: [
      {
        type: 'tr',
        children: [
          {
            type: 'th',
            children: [{ type: 'p', children: [{ text: 'Feature', bold: true }] }],
          },
          {
            type: 'th',
            children: [{ type: 'p', children: [{ text: 'Details', bold: true }] }],
          },
        ],
      },
      {
        type: 'tr',
        children: [
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'Rich Editor' }] }],
          },
          {
            type: 'td',
            children: [
              {
                type: 'p',
                children: [
                  {
                    text: 'Headings, tables, callouts, code blocks, images, checklists, toggles, equations, and more',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'tr',
        children: [
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'AI Sidebar' }] }],
          },
          {
            type: 'td',
            children: [
              {
                type: 'p',
                children: [
                  {
                    text: 'Context-aware editing with selection, comment, and document awareness',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'tr',
        children: [
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'Wing It' }] }],
          },
          {
            type: 'td',
            children: [
              {
                type: 'p',
                children: [
                  {
                    text: 'Automated research + drafting from just a topic and a few questions',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'tr',
        children: [
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'Context Docs' }] }],
          },
          {
            type: 'td',
            children: [
              {
                type: 'p',
                children: [
                  {
                    text: 'Persistent product context that shapes all AI operations',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'tr',
        children: [
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'File Management' }] }],
          },
          {
            type: 'td',
            children: [
              {
                type: 'p',
                children: [
                  {
                    text: 'Folders, drag-and-drop, import (Markdown, HTML, DOCX), and export',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'tr',
        children: [
          {
            type: 'td',
            children: [{ type: 'p', children: [{ text: 'Comments' }] }],
          },
          {
            type: 'td',
            children: [
              {
                type: 'p',
                children: [
                  {
                    text: 'Inline comments with AI-powered resolution',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  // ─── CTA ───
  {
    type: 'callout',
    icon: '\uD83D\uDE80',
    children: [
      {
        type: 'p',
        children: [
          { text: 'Ready to write your next PRD? ', bold: true },
          {
            text: 'Sign up for free and start shipping better specs today.',
          },
        ],
      },
    ],
  },
  {
    type: 'hr',
    children: [{ text: '' }],
  },
];
