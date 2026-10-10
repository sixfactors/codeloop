# Wiki design

Status: current (2026-10-07). What the redesigned `/wiki` takes from the wikis people already use, and how it is built.

## What each product contributes

- **Outline** (getoutline.com, docs.getoutline.com): collections as the top level of the sidebar, each collapsed until opened; a markdown-first editor with slash commands and keyboard save; search is one keystroke away and shows excerpts. Taken: markdown stays the source of truth, ⌘S saves, search shows excerpts.
- **GitBook** (gitbook.com/docs, structure tips): nest the sidebar at most two levels; a landing page that says what the reader is looking at and links the popular pages with cards; an automatic "On this page" table of contents from headings; one search across every doc type. Taken: home with section cards, right-hand TOC from headings, sidebar never deeper than folder › page.
- **Obsidian** (obsidian.md/help/plugins/backlinks): "linked mentions" at the bottom of a note, collapsible, with the referencing note's title. Taken: a "Pages linking here" block under the body, found by scanning the other pages' bodies for links to this page.
- **Notion** (pages returned 404 at research time; from prior use of the product): a wiki home with sections and a "recently updated" view; page properties shown as a compact header block above the body; new page from anywhere with a template per section. Taken: properties block from frontmatter, "Recently updated" list, template per folder in the new-page dialog.
- **Confluence** (not fetched; from prior use): breadcrumb Space › parent › page, "last updated" line under the title, page tree in a resizable left rail. Taken: breadcrumb Wiki › folder › page, last-updated from frontmatter, resizable rail that remembers its width.

## Shared patterns the build follows

1. Home before tree: section cards with counts and the three most recent titles, a recently-updated list, one "New page" button.
2. Sidebar folders closed by default; only the current page's folder opens; a filter box narrows the tree. Spec folders stay out of the tree (they are per-card working files) and live on the card and under a "Specs" section on the home page.
3. Search first: ⌘K already exists; `/wiki?q=` is the wiki-only results page with excerpts and folder chips.
4. Page view: breadcrumb, title, properties, body, sticky TOC on the right (hidden under 1280px), backlinks, last updated, Edit.
5. Edit mode: raw markdown with live preview, frontmatter as key/value rows, ⌘S saves with `expectVersion`; a 409 shows a conflict card with Reload and keeps the draft; drafts survive in localStorage per page.
6. New page from a template per folder, slug from the title, lands on the page.

## Chrome: fumadocs-ui components, not `DocsLayout`

`DocsLayout` and `PageTOC` render `position: fixed` columns and a `<main>` padded by `--fd-sidebar-width`; both assume they own the viewport. Inside the workspace's own shell (shadcn sidebar-07, itself fixed at the left) the two sidebars overlap at `left: 0`, so the layout is composed from fumadocs' individual pieces instead: `TreeContextProvider` + `Sidebar` + `SidebarPageTree` for the tree (folders collapsed by default, the current page's path opened by `useTreePath`), `TOCProvider` + `TOCItems` for the table of contents, `SearchDialog*` for the search dialog, `Callout` / `Cards` / `Steps` as mdx components available to the markdown renderer through `rehype-raw`. Protobox tokens reach fumadocs through its own `css/shadcn.css`, which maps `--color-fd-*` onto the shadcn variables the app already defines.

## Editor: CodeMirror split view over Milkdown

Milkdown (ProseMirror WYSIWYG) was weighed against `@uiw/react-codemirror` + `@codemirror/lang-markdown`. Milkdown re-serialises the document on every save, which normalises list markers, escapes underscores and asterisks, and drops frontmatter unless a plugin is added; the wiki's pages are files that `codeloop wiki inject` and the agents read verbatim, so byte-exact round trips matter more than WYSIWYG. CodeMirror edits the bytes as they are, loads with `next/dynamic` (no SSR) so the static export builds cleanly, and the live preview is the same renderer the page view uses, so what is previewed is what the page will show.
