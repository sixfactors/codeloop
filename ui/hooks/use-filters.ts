'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { LaneCard } from '@/lib/types';

export type GroupBy = 'lane' | 'bet';

export interface Filters {
  lane: string[];
  stage: string[];
  bet: string[];
  epic: string[];
  persona: string[];
  size: string[];
  points: string[];
  search: string;
  showDropped: boolean;
  groupBy: GroupBy;
}

export type FacetKey = 'lane' | 'stage' | 'bet' | 'epic' | 'persona' | 'size' | 'points';
export const FACETS: FacetKey[] = ['lane', 'stage', 'bet', 'epic', 'persona', 'size', 'points'];

const EMPTY: Filters = {
  lane: [], stage: [], bet: [], epic: [], persona: [], size: [], points: [],
  search: '', showDropped: false, groupBy: 'lane',
};

const STORAGE_KEY = 'codeloop-filters';

function load(): Filters {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Filters>) };
  } catch {
    return EMPTY;
  }
}

/** The facet value a card contributes, as a string, or undefined when the card has none. */
export function facetValue(card: LaneCard, key: FacetKey): string | undefined {
  const v = card[key];
  return v === undefined || v === null || v === '' ? undefined : String(v);
}

export function matches(card: LaneCard, f: Filters): boolean {
  if (!f.showDropped && card.stage === 'dropped') return false;
  for (const key of FACETS) {
    if (f[key].length === 0) continue;
    const v = facetValue(card, key);
    if (v === undefined || !f[key].includes(v)) return false;
  }
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    if (!card.title.toLowerCase().includes(q) && !card.id.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function useFilters(cards: LaneCard[] | undefined) {
  // Start empty on both server and first client paint, then restore, so the static export hydrates cleanly.
  const [filters, setFilters] = useState<Filters>(EMPTY);
  useEffect(() => { setFilters(load()); }, []);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch { /* storage unavailable */ }
  }, [filters]);

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggle = useCallback((key: FacetKey, value: string) => {
    setFilters(prev => {
      const list = prev[key];
      return { ...prev, [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] };
    });
  }, []);

  const clear = useCallback(() => setFilters(prev => ({ ...EMPTY, groupBy: prev.groupBy })), []);

  // Options come from the cards present, so a facet with no values on any card disappears from the bar.
  const options = useMemo(() => {
    const out: Record<FacetKey, string[]> = { lane: [], stage: [], bet: [], epic: [], persona: [], size: [], points: [] };
    if (!cards) return out;
    for (const key of FACETS) {
      const seen = new Set<string>();
      for (const c of cards) {
        const v = facetValue(c, key);
        if (v !== undefined) seen.add(v);
      }
      const list = [...seen];
      if (key === 'size') list.sort((a, b) => 'SML'.indexOf(a) - 'SML'.indexOf(b));
      else if (key === 'points') list.sort((a, b) => Number(a) - Number(b));
      else list.sort();
      out[key] = list;
    }
    return out;
  }, [cards]);

  const active = FACETS.some(k => filters[k].length > 0) || filters.search.trim() !== '';

  return { filters, set, toggle, clear, options, active };
}
