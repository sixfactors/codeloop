'use client';

// Carries the project id the server already resolved (from the x-codeloop-project request
// header, via currentProjectServer() in lib/project.ts) down to client components, including
// ones Next renders on the server for the initial HTML. A client component in that first pass has
// no `window` to read, so anything built from `currentProjectBrowser()` during render — a module
// that calls it at import time, a component that calls it in its body — bakes in `undefined` on
// the server and the real id on the client, which is exactly the markup mismatch that produces
// React hydration error #418. An AsyncLocalStorage keyed off the Node request was tried instead
// and does not work: Next reads the request through stream events, which lose the async context
// before a Server Component or a module far from the handler can read it back. Context sidesteps
// both problems because the server and the client render the same value: the one this provider
// was given.
import { createContext, useContext, useMemo } from 'react';
import { routesFor, type Routes } from '@/lib/routes';

interface ProjectContextValue {
  /** undefined in standalone mode; the project id under the hub. */
  project?: string;
  hub: boolean;
}

const ProjectContext = createContext<ProjectContextValue>({ project: undefined, hub: false });

export function ProjectProvider({ project, hub, children }: { project?: string | null; hub: boolean; children: React.ReactNode }) {
  const value = useMemo(() => ({ project: project ?? undefined, hub }), [project, hub]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext);
}

/** The route builder for the project this render is for. Use in JSX and anything computed during render; `routes` from lib/routes.ts stays for event handlers. */
export function useRoutes(): Routes {
  const { project } = useProject();
  return useMemo(() => routesFor(project), [project]);
}
