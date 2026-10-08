// One place for in-app links so the drawer, the inbox and the wiki all point at the same pages.
export const routes = {
  board: '/',
  card: (id: string) => `/cards/${encodeURIComponent(id)}/`,
  inbox: '/inbox/',
  wiki: (path?: string) => (path ? `/wiki/${path.split('/').map(encodeURIComponent).join('/')}/` : '/wiki/'),
  artifacts: '/artifacts/',
  roadmap: '/roadmap/',
  initiatives: '/initiatives/',
  initiative: (id: string) => `/initiatives/${encodeURIComponent(id)}/`,
  epic: (id: string) => `/epics/${encodeURIComponent(id)}/`,
  feature: (id: string) => `/features/${encodeURIComponent(id)}/`,
  /** The board narrowed to one container; the board reads these from its URL. */
  boardFor: (key: 'initiative' | 'epic' | 'feature', id: string) => `/?${key}=${encodeURIComponent(id)}`,
  evidence: (nnn: string) => `/evidence/${encodeURIComponent(nnn)}/`,
  stats: '/stats/',
  settings: '/settings/',
  setup: '/setup/',
  /** The wiki page a lane change is proposed on; the lane YAML itself is not edited from the board. */
  lanePage: (id: string) => wikiPath(`.codeloop/wiki/lanes/${id}.md`),
  personaPage: (slug: string) => wikiPath(`.codeloop/wiki/personas/${slug}.md`),
};

function wikiPath(path: string) {
  return `/wiki/${path.split('/').map(encodeURIComponent).join('/')}/`;
}

// A card id like c-058 maps to evidence folder 058.
export const evidenceId = (cardId: string) => cardId.replace(/^c-/, '');
