import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { readCards } from './cards.js';
import { mockScreens, specScreenRefs } from './mock.js';

/** What the Mocks page needs beyond an artifact row: the frames to draw a thumbnail of each, and who else uses the mock. */
export interface GalleryFields {
  /** The `data-screen` names the mock draws, in page order: one thumbnail each. */
  frames: string[];
  /** An in-app mock's folder under `<app>/mocks/`, which is its route in the project's own app. */
  folder?: string;
  /** Screens other cards' specs take from this mock (`board (mocks/118)` under `screens:`). */
  referencedBy: { cardId: string; screen: string }[];
}

const APP_PAGE = 'page.tsx';
// The same literal forms checkAppMock accepts: data-screen="x", data-screen='x', data-screen={"x"}.
const SCREEN_ATTR = /data-screen=(?:\{\s*)?["'`]([^"'`]+)["'`]/g;

/** Every card's `screens:` references, keyed by the `mocks/<from>` they name. */
function screenRefs(projectDir: string): Map<string, { cardId: string; screen: string }[]> {
  const refs = new Map<string, { cardId: string; screen: string }[]>();
  for (const card of readCards(projectDir).cards) {
    const file = card.spec ? join(projectDir, card.spec, 'spec.md') : undefined;
    if (!file || !existsSync(file)) continue;
    for (const r of specScreenRefs(readFileSync(file, 'utf-8'))) refs.set(r.from, [...(refs.get(r.from) ?? []), { cardId: card.id, screen: r.name }]);
  }
  return refs;
}

/** The artifact rows with their frames and references; a row that is not a mock gets no frames. */
export function withGalleryFields<A extends { id: string; kind: string; cardId?: string }>(projectDir: string, artifacts: A[]): (A & GalleryFields)[] {
  const refs = screenRefs(projectDir);
  return artifacts.map(a => {
    if (a.kind !== 'mock') return { ...a, frames: [], referencedBy: [] };
    const file = join(projectDir, a.id);
    const text = existsSync(file) ? readFileSync(file, 'utf-8') : '';
    const app = basename(a.id) === APP_PAGE;
    const frames = app ? [...text.matchAll(SCREEN_ATTR)].map(m => m[1]) : mockScreens(text);
    const folder = app ? basename(dirname(a.id)) : undefined;
    // A reference names the folder (`118`, `118-the-slug`) or the card (`c-118`).
    const nnn = folder?.match(/^\d+/)?.[0] ?? a.cardId?.replace(/^c-/, '');
    const names = (from: string) => !!nnn && (from === nnn || from === `c-${nnn}` || from.startsWith(`${nnn}-`));
    const referencedBy = [...refs.entries()].filter(([from]) => names(from)).flatMap(([, rows]) => rows).filter(r => r.cardId !== a.cardId);
    return { ...a, frames: [...new Set(frames)], ...(folder ? { folder } : {}), referencedBy };
  });
}
