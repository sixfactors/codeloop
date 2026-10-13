'use client';

import { useEffect, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Card, CardsQuery, Facets, InboxPayload, InboxQuery, Lane, PageWrite, PagesQuery, Rice } from '@/lib/types';
import { CARD_FACETS } from '@/lib/types';
import type { NewCardInput, ProposalInput } from '@/lib/api';
import { deriveInbox, deriveLanes, uniq } from '@/lib/cards';
import { findCard, invalidateCardLists, invalidatePageLists, patchCard, patchPage, removePage } from '@/lib/live-cache';
import { boardQueryOptions, cardCountQueryOptions, cardQueryOptions, cardsQueryOptions, homeQueryOptions, inboxQueryOptions, isMissing, pageQueryOptions, pagesQueryOptions, QK, wikiShapeQueryOptions } from '@/lib/queries';

export { boardQueryOptions, CARD_PAGE_SIZE, cardCountQueryOptions, cardQueryOptions, cardsQueryOptions, homeQueryOptions, inboxQueryOptions, inboxSince, INBOX_LIMIT, isConflict, isMissing, normaliseCardsQuery, PAGE_SIZE, pageQueryOptions, pagesQueryOptions, QK, wikiShapeQueryOptions } from '@/lib/queries';

/**
 * Cards matching the query, without event logs: the first page (CARD_PAGE_SIZE rows, prefetched by
 * the layout for the empty query) unless `all` is set, which walks every page in the background.
 * `payload` carries the owner flag, lanes and inbox summary from the first page.
 */
export function useCards(q: CardsQuery = {}, opts: { all?: boolean; enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const result = useInfiniteQuery({ ...cardsQueryOptions(q), enabled });
  const { hasNextPage, isFetching, fetchNextPage } = result;
  const walk = opts.all === true && enabled;
  // Several screens share one list; cancelRefetch: false lets their calls collapse into one request.
  useEffect(() => { if (walk && hasNextPage && !isFetching) void fetchNextPage({ cancelRefetch: false }); }, [walk, hasNextPage, isFetching, fetchNextPage]);
  const cards = useMemo(() => result.data?.pages.flatMap((p) => p.cards) ?? [], [result.data]);
  const first = result.data?.pages[0];
  return { ...result, cards, payload: first, total: first?.total ?? cards.length, complete: Boolean(result.data) && !hasNextPage };
}

/** One board column: the first CARD_PAGE_SIZE rows, then more on demand through `fetchNextPage`. */
export function useCardColumn(q: CardsQuery, enabled = true) {
  const result = useInfiniteQuery({ ...cardsQueryOptions(q), enabled });
  const cards = useMemo(() => result.data?.pages.flatMap((p) => p.cards) ?? [], [result.data]);
  const first = result.data?.pages[0];
  return { ...result, cards, total: first?.total ?? cards.length };
}

/** How many cards match, without fetching them. */
export const useCardCount = (q: CardsQuery, enabled = true) => useQuery({ ...cardCountQueryOptions(q), enabled });

/** Facet counts: from `GET /api/cards?facets=1` when the server answers with them, else from the loaded cards. */
export function useCardFacets(fallback: Card[]): Facets {
  const q = useQuery({ queryKey: QK.facets, queryFn: api.cardFacets, retry: false, staleTime: 30_000 });
  return useMemo(() => {
    if (q.data?.facets) return q.data.facets;
    const source = q.data?.cards?.length && q.data.cards.length > fallback.length ? q.data.cards : fallback;
    const out: Facets = {};
    for (const k of CARD_FACETS) {
      out[k] = uniq(source.map((c) => c[k] as string | undefined)).map((value) => ({ value, count: source.filter((c) => String(c[k] ?? '') === value).length }));
    }
    return out;
  }, [q.data, fallback]);
}

export function useLanes(enabled = true) {
  const lanes = useQuery({ queryKey: QK.lanes, queryFn: api.lanes, retry: false, enabled });
  // The first page of cards carries the lanes too; nothing here walks the list.
  const cards = useCards({}, { enabled });
  const data: Lane[] = useMemo(() => deriveLanes(cards.cards, lanes.data?.length ? lanes.data : cards.payload?.lanes), [cards.cards, cards.payload?.lanes, lanes.data]);
  return { data, isLoading: cards.isLoading && lanes.isLoading, fromApi: Boolean(lanes.data?.length) };
}

/**
 * The inbox from GET /api/inbox: three lists of at most INBOX_LIMIT rows and the per-lane numbers.
 * On a server without the route the same shape is derived from the full card list, which is the
 * only time the client walks every page. `enabled` disables all of it (main query, fallback walk
 * and lanes), for a caller with no project in scope, e.g. the hub home shell.
 */
export function useInbox(q: InboxQuery = {}, enabled = true) {
  const result = useQuery({ ...inboxQueryOptions(q), enabled });
  const missing = enabled && Boolean(result.error) && isMissing(result.error);
  const fallback = useCards({ limit: 200 }, { all: missing, enabled });
  const lanes = useLanes(enabled);
  const data = useMemo<InboxPayload | undefined>(() => {
    if (result.data) return result.data;
    if (!missing || !fallback.complete) return undefined;
    return deriveInbox(fallback.cards, lanes.data, q.shippedSince ? new Date(q.shippedSince) : new Date(Date.now() - 7 * 86_400_000), q.limit);
  }, [result.data, missing, fallback.complete, fallback.cards, lanes.data, q.shippedSince, q.limit]);
  const isLoading = missing ? !fallback.complete : result.isLoading;
  const error = missing ? fallback.error : result.error;
  return { data, isLoading, error, fromApi: Boolean(result.data), refetch: missing ? fallback.refetch : result.refetch };
}

/** One card. Opens instantly from a list's copy, then carries the event log once GET /api/cards/:id answers. */
export function useCard(id: string) {
  const qc = useQueryClient();
  return useQuery({ ...cardQueryOptions(id, qc), enabled: Boolean(id), placeholderData: () => findCard(qc, id) });
}

export const useQuestions = (id: string) =>
  useQuery({ queryKey: QK.questions(id), queryFn: () => api.questions(id), enabled: Boolean(id) });

export const useCardFull = (id: string) =>
  useQuery({ queryKey: QK.full(id), queryFn: () => api.cardFull(id), enabled: Boolean(id), retry: false });

export const useInitiatives = () => useQuery({ queryKey: QK.initiatives, queryFn: api.initiatives, retry: false });
export const useInitiativeList = () => useQuery({ queryKey: QK.initiatives, queryFn: api.initiativesList, retry: false });
export const initiativeTreeOptions = (id: string) => ({ queryKey: QK.initiativeTree(id), queryFn: () => api.initiativeTree(id), retry: false });
export const useInitiativeTree = (id: string) => useQuery({ ...initiativeTreeOptions(id), enabled: Boolean(id) });
/** The trees of several initiatives at once, for the table's per-row counts (one small request each). */
export const useInitiativeTrees = (ids: string[]) => useQueries({ queries: ids.map((id) => initiativeTreeOptions(id)) });
export const useEpicTree = (id: string) => useQuery({ queryKey: QK.epicTree(id), queryFn: () => api.epicTree(id), enabled: Boolean(id), retry: false });
export const useFeature = (id: string) => useQuery({ queryKey: QK.feature(id), queryFn: () => api.feature(id), enabled: Boolean(id), retry: false });

/** Score a feature: the API derives every score and band from the RICE block, so lists, trees and the inbox refetch. */
export function useScoreFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rice }: { id: string; rice: Rice }) => api.scoreFeature(id, rice),
    onSuccess: async (_f, { id }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: QK.feature(id) }),
        qc.invalidateQueries({ queryKey: ['initiatives'] }),
        qc.invalidateQueries({ queryKey: ['epics'] }),
        invalidateCardLists(qc),
      ]);
      void qc.invalidateQueries({ queryKey: QK.facets });
      void qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

/** Create a card: started in its lane (`start`) or proposed into the backlog. Lists and counts refetch after. */
export function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, start }: { input: NewCardInput | ProposalInput; start?: boolean }) => (start ? api.newCard(input) : api.proposeCard(input)),
    onSuccess: async () => {
      await invalidateCardLists(qc);
      void qc.invalidateQueries({ queryKey: ['cards'], predicate: (query) => query.queryKey.at(-1) === 'count' });
      void qc.invalidateQueries({ queryKey: QK.facets });
      void qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

/** Starts the shape workflow from a problem statement. Lists, counts and the next panel refetch. */
export function useShapeProblem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (problem: string) => api.shapeProblem(problem),
    onSuccess: async () => {
      await invalidateCardLists(qc);
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      void qc.invalidateQueries({ queryKey: QK.next });
    },
  });
}

/** Every page summary matching the params, walked to the end like useCards with `all`. */
export function usePages(p: PagesQuery = {}, enabled = true) {
  const result = useInfiniteQuery({ ...pagesQueryOptions(p), retry: false, enabled });
  const { hasNextPage, isFetching, fetchNextPage } = result;
  useEffect(() => { if (enabled && hasNextPage && !isFetching) void fetchNextPage({ cancelRefetch: false }); }, [enabled, hasNextPage, isFetching, fetchNextPage]);
  const pages = useMemo(() => result.data?.pages.flatMap((x) => x.pages) ?? [], [result.data]);
  return { ...result, pages, total: result.data?.pages[0]?.total ?? pages.length };
}

export const usePage = (path: string) => useQuery({ ...pageQueryOptions(path), enabled: Boolean(path) });
/** The wiki shape with page counts: section order, titles, purpose, computed by the server. The home page and sidebar read this instead of grouping the full page list themselves. */
export const useWikiShape = () => useQuery(wikiShapeQueryOptions());
export const useEvidence = (nnn: string) =>
  useQuery({ queryKey: QK.evidence(nnn), queryFn: () => api.evidence(nnn), enabled: Boolean(nnn), retry: false });
export const useArtifacts = () => useQuery({ queryKey: QK.artifacts, queryFn: api.artifacts, retry: false });
export const useStats = () => useQuery({ queryKey: QK.stats, queryFn: api.stats, retry: false });
export const useConfig = (enabled = true) => useQuery({ queryKey: QK.config, queryFn: api.config, retry: false, enabled });

/** Owner mode, this browser's sign-in state, token validity and the project. Polled: signing in or out in another tab should be noticed here too. */
export const useSession = () => useQuery({ queryKey: QK.session, queryFn: api.session, retry: false, staleTime: 5_000, refetchInterval: 15_000 });

/** Why a write control is disabled; the same text for every one of them, so a reader learns it once. */
export const SIGN_IN_REASON = 'Sign in to answer and approve.';
export const READ_ONLY_REASON = 'This board was started read-only. Nobody can answer or approve from it.';

/**
 * Whether THIS browser can write: the server grants owner rights at all, and this browser is
 * either signed in or carries the API token. Every write control reads this, not the owner flag
 * alone, so an unsigned-in visitor sees a disabled button instead of a 403 on click.
 */
export function useCanWrite() {
  const session = useSession();
  const owner = Boolean(session.data?.owner);
  const authenticated = Boolean(session.data?.signedIn || session.data?.tokenValid);
  const canWrite = owner && authenticated;
  const reason = canWrite ? undefined : !owner ? READ_ONLY_REASON : SIGN_IN_REASON;
  return { canWrite, reason, needsSignIn: owner && !authenticated, session: session.data, isLoading: session.isLoading };
}

/** The board's "what next" panel: one state, with the data that state needs. */
export const useNextAction = () => useQuery({ queryKey: QK.next, queryFn: api.next, retry: false });

/** The board: one row of states for the whole project, server-grouped (GET /api/board). */
export const useBoard = () => useQuery(boardQueryOptions());
/** Home: what needs you, what is failing, what is moving, which agents are working, what shipped (GET /api/home). */
export const useHome = (enabled = true) => useQuery({ ...homeQueryOptions(), enabled });

/** Signs this browser in; refetches the session on success so every write control re-enables at once. */
export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ user, password }: { user: string; password: string }) => api.login(user, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.session }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.session }),
  });
}

/** Settings' "Board sign-in" section: change user and/or password, current password required. */
export function useChangeBoardAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword: string; user?: string; newPassword?: string }) => api.changeBoardAuth(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.session }),
  });
}

/** After a write, refresh that one card and patch it into every list; the live stream does the same for other tabs. */
export async function refreshCard(qc: QueryClient, id: string) {
  try {
    const card = await api.card(id);
    qc.setQueryData(QK.card(id), card);
    if (!patchCard(qc, card)) await invalidateCardLists(qc);
  } catch (e) {
    // A server without GET /api/cards/:id, or a card that moved out of every filtered list.
    if (isMissing(e)) await invalidateCardLists(qc);
    else throw e;
  }
  void qc.invalidateQueries({ queryKey: QK.questions(id) });
  void qc.invalidateQueries({ queryKey: QK.full(id) });
  void qc.invalidateQueries({ queryKey: QK.stats });
  // A write moves cards between lists and columns: the inbox and the counts are refetched, not patched.
  void qc.invalidateQueries({ queryKey: ['inbox'] });
  void qc.invalidateQueries({ queryKey: ['cards'], predicate: (query) => query.queryKey.at(-1) === 'count' });
  // The write may have resolved what the "what next" panel was waiting on.
  void qc.invalidateQueries({ queryKey: QK.next });
}

export function useDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) => api.decide(id, action, note),
    onSuccess: (_r, { id }) => refreshCard(qc, id),
  });
}

export function useAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, n, body }: { id: string; n: number; body: { text: string } | { accept: true } }) => api.answer(id, n, body),
    onSuccess: (_r, { id }) => refreshCard(qc, id),
  });
}

export function useTriage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'promote' | 'drop' }) => (action === 'promote' ? api.promote(id) : api.drop(id)),
    onSuccess: (_r, { id }) => refreshCard(qc, id),
  });
}

export function useSavePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, write }: { path: string; write: PageWrite }) => api.savePage(path, write),
    onSuccess: (page, { path }) => {
      qc.setQueryData(QK.page(path), page);
      if (!patchPage(qc, page)) void invalidatePageLists(qc);
    },
  });
}

export function useDeletePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path }: { path: string }) => api.deletePage(path),
    // Drop the page's query rather than invalidating it: a refetch of a deleted page is a 404.
    onSuccess: (_r, { path }) => removePage(qc, path),
  });
}

// --- the stage, its output and the setup screen ----------------------------------------------

/** The card with its stage brief: skill, output path and the check command, paths substituted. */
export const useCardShow = (id: string) =>
  useQuery({ queryKey: QK.show(id), queryFn: () => api.show(id), enabled: Boolean(id), retry: false });

/** Run the stage's check (`codeloop next`). The report is returned to the caller; the card refreshes either way. */
export function useAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.advance(id),
    onSettled: (_r, _e, { id }) => { void refreshCard(qc, id); void qc.invalidateQueries({ queryKey: QK.show(id) }); void qc.invalidateQueries({ queryKey: QK.output(id) }); },
  });
}

/** Start an agent on the card's stage. The id comes back at once; `useRun` follows it. */
export const useRunStage = () =>
  useMutation({ mutationFn: ({ id, agent }: { id: string; agent?: string }) => api.runStage(id, agent) });

/** One run, polled every two seconds while it is running (the stream carries the lines; this carries the status). */
export function useRun(runId: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: QK.run(runId ?? ''),
    queryFn: () => api.run(runId!),
    enabled: Boolean(runId),
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === 'running' || !query.state.data ? 2000 : false),
  });
  useEffect(() => {
    // The run wrote the stage's output and moved the card: refresh what the screen shows of both.
    if (q.data && q.data.status !== 'running' && q.data.cardId) void refreshCard(qc, q.data.cardId);
  }, [q.data, qc]);
  return q;
}

export const useCardOutput = (id: string, enabled = true) =>
  useQuery({ queryKey: QK.output(id), queryFn: () => api.cardOutput(id), enabled: Boolean(id) && enabled, retry: false });

export function useSaveCardOutput() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api.saveCardOutput(id, text),
    onSuccess: (out, { id }) => { qc.setQueryData(QK.output(id), out); void qc.invalidateQueries({ queryKey: QK.full(id) }); },
  });
}

/** Ask one or more questions on a card; the inbox and the card's question count refetch. */
export function useAsk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: { question: string; recommended?: string }[] }) => api.ask(id, items),
    onSuccess: (_r, { id }) => refreshCard(qc, id),
  });
}

/** Split a story into siblings under its feature; every list and the feature's tree refetch. */
export function useSplit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, titles }: { id: string; titles: string[] }) => api.splitCard(id, titles),
    onSuccess: async (_r, { id }) => {
      await Promise.all([refreshCard(qc, id), invalidateCardLists(qc)]);
      void qc.invalidateQueries({ queryKey: ['features'] });
      void qc.invalidateQueries({ queryKey: ['epics'] });
      void qc.invalidateQueries({ queryKey: ['initiatives'] });
    },
  });
}

export const useFeatures = () => useQuery({ queryKey: QK.features, queryFn: api.features, retry: false });

/** Setup state; a server without the route answers 404, which the shell reads as "nothing to gate on". */
export const useSetupStatus = () => useQuery({ queryKey: QK.setup, queryFn: api.setupStatus, retry: false, staleTime: 30_000 });

export function useSetupDetect() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.setupDetect(), onSuccess: () => qc.invalidateQueries({ queryKey: QK.setup }) });
}

export function useSetupAdopt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ from }: { from?: string[] }) => api.setupAdopt(from),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK.setup }); void qc.invalidateQueries({ queryKey: QK.config }); },
  });
}
