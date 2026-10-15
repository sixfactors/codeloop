'use client';

// The browser tab title, one pattern on every page: "<page or story title> · <project>". PageLayout
// reports its title here; the app shell owns document.title and falls back to the section name
// (Board, Stats) while a page has not reported one. One owner, because React runs a child's effect
// before its parent's, so two components writing document.title would let the shell overwrite the page.

import { createContext, useContext, useEffect } from 'react';

export const PageTitleContext = createContext<(title: string | undefined) => void>(() => {});

/** Reports `title` as the page's own while the calling component is mounted. */
export function usePageTitle(title: string | undefined) {
  const set = useContext(PageTitleContext);
  useEffect(() => {
    set(title);
    return () => set(undefined);
  }, [set, title]);
}

/** Rendered by PageLayout, which stays usable from server components: this is the client part. */
export function PageTitle({ title }: { title?: string }) {
  usePageTitle(title);
  return null;
}

/** "<title> · <project>", or the title alone when there is no project in scope (the hub home). */
export const documentTitle = (title: string, project?: string) => (project ? `${title} · ${project}` : title);
