## 1. Problem & Goals

### Problem

PMs writing PRDs today bounce between multiple tools: a doc editor, AI chat, and many reference tabs. This creates friction in early-stage thinking: capturing ideas, iterating on structure, and doing light research while writing.

### v1 Goal

Deliver a focused, high-polish web app where PMs can:

- Write PRDs in a clean, fast editor (Plate.js-based).
- Keep an explicit context doc alongside their PRDs - similar to CLAUDE.md
- Use an AI side panel that understands the current doc + context to help with rewriting, structuring, and light research.

All with minimal custom editor code by leaning heavily on Plate’s existing primitives.

## 2. Scope & Non-Goals

### In Scope (v1)

- Web app only.
- Single-player usage (no sharing, comments, or real-time collaboration).
- Auth via Clerk (basic sign up / login / logout).
- Basic multi-doc environment:
  
  - Folder-like grouping for docs.
- Plate.js-based rich-text editor opinionated set of built-in blocks.
- AI side-panel chat that:
  
  - Has active doc + context doc + list of all documents (tree) in its system prompt
  - Can read any document
  - Perform editor-assist actions (rewrite, summarize, expand, structure).
  - Perform light web research and summarize into the doc.
- Explicit context doc is just another doc, with light affordances.
- High-polish, near-production visual quality and UX.

### Out of Scope (v1)

- Organization-wide PRD repository / team workspaces.
- Multi-user collaboration, comments, mentions, or sharing.
- Integrations with Notion/Google Docs/Coda/etc.
- File import/export flows (beyond copy-paste).
- Mobile or desktop apps.
- Analytics / instrumentation.

## 3. Primary User & Key Scenarios

### Primary User

- Product managers at startups or tech companies.
- Comfortable with AI tools (ChatGPT/Claude) and modern editors.
- Mix of experience levels; don’t overfit to any one seniority.

### Key Scenarios

1. **Draft a new PRD from scratch**

   - Create a folder for an initiative.
   - Edit its context doc with problem space, constraints, and links.
   - Create a new PRD doc in that folder and use AI side panel to shape the narrative.

2. **Iterate on a messy draft**

   - Paste an existing rough PRD into a doc.
   - Use AI to rewrite sections, improve structure, and summarize long passages.

3. **Do light research while writing**

   - While editing a PRD, ask AI to research specific questions (via web search).
   - Insert summarized findings into the doc without leaving the app.

## 4. Product Overview (What Exists in v1)

### High-Level Objects

- **User** (via Clerk)
- **Doc**
  - Types (implicit): normal doc or **global context doc** (one per user).
  - Content: Plate.js rich-text content.
- **AI Session**
  - Tied to: active doc + the user’s global context doc.

### High-Level Layout

- **Left sidebar**: folders and docs navigation.
- **Main area**: Plate.js editor for the active doc.
- **Right side panel**: AI chat panel.
- Minimal top-level app chrome (app name, user menu, maybe basic actions like “New folder”, “New doc”).

## 5. Detailed Specs

### 5.1 Auth & App Shell

#### Requirements

- Use Clerk for authentication.
- Flows:
  
  - Sign up (email-based or as configured in Clerk).
  - Login / logout.
- After login, user lands on:
  
  - Last opened doc, if any.
  - Else: a default “Welcome” folder + context doc + sample PRD doc auto-created.

#### UX

- Clean, minimal top bar with:
  
  - App name/logo (ThinkOS).
  - User avatar/menu (Clerk-powered) with logout.

### 5.2 Folders & Docs

#### Docs & Global Context

- Each user has a set of docs.
- One special doc per user is the **global context doc**.
- All other docs are normal working docs (PRDs, notes, etc.).

#### Global Context Doc

- Auto-created for each new user (e.g. named `Context` or `CLAUDE.md`).
- Lives in the root doc list, visually distinguished.
- Represents the background knowledge for all the user’s work: problem areas, constraints, links, reusable snippets.
- Editable in the same editor as any other doc.
- Cannot be deleted in v1 neither can it be renamed.
- User sees a single-level list of docs.
- The global context doc is pinned at the top of this list.

#### Doc Model

- Each doc belongs to exactly one folder.
- Each doc has:
  
  - Name (editable title).
  - Plate.js content.
- One doc per folder is marked as the **context doc** (cannot delete; can rename like any other doc).

#### Doc Behaviors

- Create doc:
  
  - Action: "+ New Doc" inside a folder.
  - Defaults to a blank doc with a placeholder title (e.g. "Untitled Doc").
- Rename doc:
  
  - Inline editing of the title at top of editor, or in the sidebar upon double click.
- Delete doc:
  
  - Allowed for all docs except you cannot delete the only context doc of a folder.
- Switch doc:
  
  - Clicking on a doc in sidebar loads it in the main editor and updates AI side panel context.

#### Sidebar UX

- Left sidebar sections:
  
  - List of folders (collapsible, or simple grouped listing).
  - Under each folder, list of docs, with the context doc visually distinguished (e.g. label "Context").
- Smooth, responsive behavior with keyboard and mouse.

### 5.3 Editor (Plate.js-Based)

#### Goals

- Use Plate.js primarily via configuration and built-in plugins.
- Avoid custom editor primitives; focus on selecting and wiring existing Plate plugins.
- Provide a clean, familiar doc experience with a few rich blocks.

#### Core Editor Features (v1)

- Basic text editing:
  
  - Paragraphs.
  - Headings (H1–H3).
  - Bold, italic, underline, strikethrough.
  - Inline code.
- Lists:
  
  - Bulleted lists.
  - Numbered lists.
  - Indent/outdent.
- Links:
  
  - Insert/edit URL on selection.
- Blockquotes.
- Code blocks (for snippets, pseudo-code, API examples).
- Horizontal rule.
- Tables

Use existing Plate.js plugins that map to these primitives (no custom nodes unless trivial configuration).

#### Optional Rich Blocks (from built-in Plate only)

- Checklists / task list items.
- Callout / info blocks, if Plate offers a simple, plug-and-play option.

If a desired block type requires custom schema or complex implementation, defer it to later versions.

#### Editor UX

- Top-aligned doc title separate from body content.
- Sticky formatting toolbar:
  
  - Either a floating bubble on selection or a fixed toolbar above the document, using Plate’s existing UI components where possible.
- Keyboard-friendly:
  
  - Enter, Shift+Enter behaviors should feel like a normal doc editor.
  - Standard shortcuts (Cmd/Ctrl+B, I, etc.) via Plate where supported.
- Autosave behavior:
  
  - Docs autosave on change with minimal visual noise (e.g. a subtle "Saved" indicator).

### 5.4 AI Side Panel (Chat)

#### Goals

- Primary AI surface is a chat-style side panel.
- AI always has access to:
  
  - The current doc content.
  - The context doc content.
  - List of Documents via tree
- AI can:
  
  - Discuss ideas.
  - Read any other documents
  - Perform document-level actions (rewrite, summarize, expand, structure) via user commands.
  - Perform light web research and summarize back to the user.

#### Invocation Model

- Right-side panel that can be toggled (e.g. via button in top bar or hotkey).
- Within the panel:
  
  - Chat-style interface: user messages and AI responses.
  - A few quick-action buttons for common operations, e.g.:
    
    - "Rewrite selection"
    - "Summarize selection"
    - "Expand selection"
    - "Outline this doc"

#### Context Handling

- For every AI request, the system constructs context from:
  
  - Current doc (full or relevant parts, implementation detail).
  - Folder context doc (full or relevant parts, implementation detail).
  - User message.
- The PRD does not specify token limits or chunking; only that AI **should consider both the current doc and context doc**.

#### Core AI Capabilities

1. **Rewrite Selection**

   - User flow:
     
     - User selects text in the editor.
     - Clicks "Rewrite selection" quick action in AI panel (or types a prompt like "Rewrite this more crisply").
   - Behavior:
     
     - AI returns a rewritten version of the selected text.
     - User can accept or reject:
       
       - Show the proposed rewrite in the chat.
       - Provide an "Apply" button to replace the selected text in the editor.

2. **Summarize Selection / Doc**

   - Selection:
     
     - User selects a block of text.
     - Clicks "Summarize selection".
     - AI returns a short summary in chat.
     - Optional: "Insert summary below" to add as a new paragraph/bullet in the doc.
   - Whole doc:
     
     - User can type "Summarize this doc".
     - AI returns high-level summary in chat.

3. **Expand / Elaborate**

   - User selects a short passage.
   - Clicks "Expand selection" or asks "Expand this with more detail for stakeholders".
   - AI proposes an expanded version in chat with "Apply" to replace or "Insert below".

4. **Structure / Outline**

   - User asks: "Give me a better outline for this PRD".
   - AI:
     
     - Reads current doc + context doc, and other docs if relevant
     - Returns a proposed outline (headings/bullets) in chat.
     - Optionally offers an "Apply outline" action that inserts the outline at cursor or in a new doc (implementation detail; v1 can keep this simple—just paste output where cursor is).

5. **Light Web Research**

   - User asks factual / research questions.
   - System performs web search behind the scenes.
   - AI responds with a concise synthesis in chat.
   - Optional: "Insert into doc" button to paste the answer at cursor.

#### General Chat

- Users can ask open-ended questions.
- AI responses should be aware of:
  
  - What the user is currently working on in the doc.
  - The folder’s context doc.
- No need for conversation history persistence beyond the current session, unless trivial to support.

### 5.5 Visual Design & UX Polish

#### Overall Feel

- Clean, modern, near-production quality.
- Layout similar to modern editors (Notion/Coda-like simplicity, but lighter):
  
  - Left navigation, center editor, right AI panel.

#### Key Visual Requirements

- Clear visual hierarchy:
  
  - Distinct styling for doc title vs body.
  - Context doc visually labeled.
- Subtle but clear selection and hover states.
- Light theme is enough for v1 (no need for dark mode initially).
- Smooth transitions for opening/closing AI panel and switching docs.
- Use Plate UI

#### Keyboard & Efficiency

- Basic keyboard shortcuts:
  
  - New doc (e.g. Cmd/Ctrl+N from within a folder).
  - Toggle AI panel (e.g. Cmd/Ctrl+Shift+A).
- Ensure typing and AI responses never block each other (non-blocking UI).

## 6. Non-Functional Requirements

- **Performance**: Editor should feel snappy on typical PRD length documents.
- **Reliability**: Autosave must be reliable; no explicit save required.
- **Security**: Rely on Clerk for auth; ensure docs are only accessible to their owners.
- **Privacy**: Clearly communicate that AI requests send relevant doc/context content to the AI backend.

## 7. Open Questions / Future Extensions (Not for v1 Build)

These are explicitly not in v1 but guide the design so we don’t paint ourselves into a corner:

- Multi-user collaboration and sharing:
  
  - How to share a folder or doc with others for commenting or editing.
- Org-wide knowledge base:
  
  - Connecting multiple users’ folders into a shared workspace.
  - Indexing across docs for AI.
- Integrations:
  
  - Export to Google Docs/Notion.
  - Connecting to code repos, design tools, etc.
- Templates & structure:
  
  - Opinionated PRD templates.
  - Reusable sections and blocks.

For v1, focus on a rock-solid, Plate.js-powered editor + context doc + AI side panel that together make writing and refining a single PM’s PRDs significantly easier and faster.