// What the collection is worth on Discogs: the cheapest copy for sale of each matched record, added up. It is a rough
// floor, not a resale price, and nothing has to be typed in. Records not matched on Discogs can't be counted, and the
// screen says how many those are.
import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import type { MarketPrice } from "../../../supabase/functions/recordLookup/lookup";
import { albumWaitMs, callLookup } from "./lookup";
import type { VinylRecord } from "./records";
import { getSupabase } from "./supabaseClient";

export interface ValuedRecord {
  record: VinylRecord;
  price: number;
}

export interface CollectionValue {
  total: number;
  currency: string;
  counted: number; // matched records with a price
  unmatched: number; // no Discogs match yet
  noPrice: number; // matched, but none for sale on Discogs right now
  waiting: number; // matched, price not checked yet
  top: ValuedRecord[]; // the most valuable, dearest first
}

export function collectionValue(records: VinylRecord[], prices: Record<string, MarketPrice | null>, topCount = 3): CollectionValue {
  const value: CollectionValue = { total: 0, currency: "", counted: 0, unmatched: 0, noPrice: 0, waiting: 0, top: [] };
  const valued: ValuedRecord[] = [];
  for (const record of records) {
    const id = discogsIdOf(record);
    if (!id) {
      value.unmatched += 1;
      continue;
    }
    const key = String(id);
    if (!(key in prices)) value.waiting += 1;
    else {
      const price = prices[key];
      if (!price || price.lowest === null || !price.forSale) value.noPrice += 1;
      else {
        value.counted += 1;
        value.total += price.lowest;
        value.currency ||= price.currency;
        valued.push({ record, price: price.lowest });
      }
    }
  }
  value.top = valued.sort((a, b) => b.price - a.price).slice(0, topCount);
  return value;
}

export function moneyText(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "EUR", maximumFractionDigits: amount >= 100 ? 0 : 2 })
      .format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function discogsIdOf(record: VinylRecord): number | null {
  const id = Number(record.DiscogsID);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Prices are kept on the phone for a day, so Stats opens with the total straight away. Discogs allows about 60
// requests a minute, so prices are asked for at most 25 at a time and at most once every 30 seconds; a big
// collection fills in over a few rounds. Each round keeps the 15-second limit of every price lookup.
const cacheKey = "vinylValuePrices";
const cacheHours = 24;
export const roundSize = 25;
export const roundGapMs = 30000;

type PriceCache = Record<string, { at: number; price: MarketPrice | null }>;

function readCache(): PriceCache {
  try {
    return JSON.parse(localStorage.getItem(cacheKey) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function writeCache(cache: PriceCache) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(cache));
  } catch {
    // no storage: prices are asked for again next time
  }
}

// The prices already known for these releases, and the ones still to ask for
export function knownPrices(ids: number[], now: number = Date.now()): { prices: Record<string, MarketPrice | null>; missing: number[] } {
  const cache = readCache();
  const prices: Record<string, MarketPrice | null> = {};
  const missing: number[] = [];
  for (const id of new Set(ids)) {
    const entry = cache[id];
    if (entry && now - entry.at < cacheHours * 3600000) prices[String(id)] = entry.price;
    else missing.push(id);
  }
  return { prices, missing };
}

// One round: asks Discogs for up to roundSize prices and keeps the answers. Releases Discogs was too slow for are left
// out, to ask for again.
export async function fetchPriceRound(supabase: SupabaseClient, ids: number[], now: number = Date.now()):
  Promise<Record<string, MarketPrice | null>> {
  const batch = ids.slice(0, roundSize);
  const { prices } = await callLookup<{ prices: Record<string, MarketPrice | null> }>(supabase, { action: "prices", discogsIds: batch },
    albumWaitMs);
  const cache = readCache();
  const answered: Record<string, MarketPrice | null> = {};
  for (const id of batch) {
    if (prices && String(id) in prices) {
      cache[id] = { at: now, price: prices[String(id)] };
      answered[String(id)] = prices[String(id)];
    }
  }
  writeCache(cache);
  return answered;
}

export interface ValuePrices {
  prices: Record<string, MarketPrice | null>;
  status: "idle" | "checking" | "done" | "slow" | "failed";
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Fills in the prices for these records round by round while Stats is open
export function useValuePrices(records: VinylRecord[]): ValuePrices {
  const idsKey = [...new Set(records.map(discogsIdOf).filter((id): id is number => id !== null))].sort((a, b) => a - b).join(",");
  const [state, setState] = useState<ValuePrices>(() => ({ prices: knownPrices(idsKey ? idsKey.split(",").map(Number) : []).prices,
    status: "idle" }));

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",").map(Number) : [];
    const signal = { stopped: false };
    const run = async () => {
      let { prices, missing } = knownPrices(ids);
      setState({ prices, status: missing.length ? "checking" : "done" });
      while (missing.length && !signal.stopped) {
        const started = Date.now();
        let answered: Record<string, MarketPrice | null>;
        try {
          answered = await fetchPriceRound(getSupabase(), missing);
        } catch {
          if (!signal.stopped) setState({ prices, status: "failed" });
          return;
        }
        if (signal.stopped) return;
        prices = { ...prices, ...answered };
        missing = missing.filter((id) => !(String(id) in answered));
        if (Object.keys(answered).length === 0) {
          setState({ prices, status: "slow" }); // Discogs answered nothing this round: try again next time
          return;
        }
        setState({ prices, status: missing.length ? "checking" : "done" });
        if (missing.length) await wait(Math.max(0, roundGapMs - (Date.now() - started)));
      }
    };
    void run();
    return () => { signal.stopped = true; };
  }, [idsKey]);

  return state;
}
