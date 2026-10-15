// One place for in-app links so the drawer, the inbox and the wiki all point at the same pages.
//
// Under the hub every page lives at /p/<project>/..., not /...; `routesFor()` takes the project
// explicitly rather than reading the URL, because a server-rendered client component has no
// `window` to read, see components/providers/project-provider.tsx, which supplies the project the
// server already resolved via a React context, and lib/project.ts's `currentProjectServer()`.
// Components rendering links use `useRoutes()` from that provider. `routes` below is kept only for
// callers that are never part of a render pass (event handlers, api.ts): it delegates to
// `routesFor(currentProjectBrowser())`, which is safe there because it only ever runs in the
// browser, after a click or a submit, never during SSR.
import { currentProjectBrowser } from './project';

export function routesFor(project?: string) {
  const prefix = project ? `/p/${encodeURIComponent(project)}` : '';
  const wikiPath = (path: string) => `${prefix}/wiki/${path.split('/').map(encodeURIComponent).join('/')}/`;
  return {
    get board() { return `${prefix}/`; },
    get home() { return `${prefix}/home/`; },
    card: (id: string) => `${prefix}/cards/${encodeURIComponent(id)}/`,
    get inbox() { return `${prefix}/inbox/`; },
    wiki: (path?: string) => (path ? wikiPath(path) : `${prefix}/wiki/`),
    get artifacts() { return `${prefix}/artifacts/`; },
    get mocks() { return `${prefix}/mocks/`; },
    /** An in-app mock's own page, by its folder under app/mocks/. */
    mockPage: (folder: string) => `${prefix}/mocks/${encodeURIComponent(folder)}/`,
    get roadmap() { return `${prefix}/roadmap/`; },
    get initiatives() { return `${prefix}/initiatives/`; },
    initiative: (id: string) => `${prefix}/initiatives/${encodeURIComponent(id)}/`,
    epic: (id: string) => `${prefix}/epics/${encodeURIComponent(id)}/`,
    feature: (id: string) => `${prefix}/features/${encodeURIComponent(id)}/`,
    /** The board narrowed to one container; the board reads these from its URL. */
    boardFor: (key: 'initiative' | 'epic' | 'feature', id: string) => `${prefix}/?${key}=${encodeURIComponent(id)}`,
    evidence: (nnn: string) => `${prefix}/evidence/${encodeURIComponent(nnn)}/`,
    get stats() { return `${prefix}/stats/`; },
    get settings() { return `${prefix}/settings/`; },
    get setup() { return `${prefix}/setup/`; },
    /** The wiki page a lane change is proposed on; the lane YAML itself is not edited from the board. */
    lanePage: (id: string) => wikiPath(`.codeloop/wiki/lanes/${id}.md`),
    personaPage: (slug: string) => wikiPath(`.codeloop/wiki/personas/${slug}.md`),
  };
}

export type Routes = ReturnType<typeof routesFor>;

/** Non-render use only (event handlers, api.ts). Anything rendered needs `useRoutes()` instead. */
export const routes: Routes = {
  get board() { return routesFor(currentProjectBrowser()).board; },
  get home() { return routesFor(currentProjectBrowser()).home; },
  card: (id: string) => routesFor(currentProjectBrowser()).card(id),
  get inbox() { return routesFor(currentProjectBrowser()).inbox; },
  wiki: (path?: string) => routesFor(currentProjectBrowser()).wiki(path),
  get artifacts() { return routesFor(currentProjectBrowser()).artifacts; },
  get mocks() { return routesFor(currentProjectBrowser()).mocks; },
  mockPage: (folder: string) => routesFor(currentProjectBrowser()).mockPage(folder),
  get roadmap() { return routesFor(currentProjectBrowser()).roadmap; },
  get initiatives() { return routesFor(currentProjectBrowser()).initiatives; },
  initiative: (id: string) => routesFor(currentProjectBrowser()).initiative(id),
  epic: (id: string) => routesFor(currentProjectBrowser()).epic(id),
  feature: (id: string) => routesFor(currentProjectBrowser()).feature(id),
  boardFor: (key: 'initiative' | 'epic' | 'feature', id: string) => routesFor(currentProjectBrowser()).boardFor(key, id),
  evidence: (nnn: string) => routesFor(currentProjectBrowser()).evidence(nnn),
  get stats() { return routesFor(currentProjectBrowser()).stats; },
  get settings() { return routesFor(currentProjectBrowser()).settings; },
  get setup() { return routesFor(currentProjectBrowser()).setup; },
  lanePage: (id: string) => routesFor(currentProjectBrowser()).lanePage(id),
  personaPage: (slug: string) => routesFor(currentProjectBrowser()).personaPage(slug),
};

// A card id like c-058 maps to evidence folder 058.
export const evidenceId = (cardId: string) => cardId.replace(/^c-/, '');
