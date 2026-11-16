// The want list: priorities, sorting, Discogs links and prices, and turning a want into a record
import type { SupabaseClient } from "@supabase/supabase-js";

import type { MarketPrice } from "../../../supabase/functions/recordLookup/lookup";
import type { DiscogsHit } from "./lookup";
import { callLookup } from "./lookup";
import type { WantRow } from "./records";

export type { MarketPrice };

export const priorities: { value: number; label: string }[] = [
  { value: 1, label: "High" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Low" },
];

// 1 high, 2 medium, 3 low; medium when a want has none
export function priorityOf(want: Pick<WantRow, "Priority">): number {
  const value = Number(want.Priority);
  return value === 1 || value === 2 || value === 3 ? value : 2;
}

export const priorityLabel = (want: Pick<WantRow, "Priority">) => priorities.find((item) => item.value === priorityOf(want))!.label;

// Highest priority first, then the newest
export function sortWants(wants: WantRow[]): WantRow[] {
  return [...wants].sort((a, b) => priorityOf(a) - priorityOf(b) || Number(b.id) - Number(a.id));
}

export function discogsLink(want: Pick<WantRow, "DiscogsID" | "Artist" | "AlbumName">): string {
  const id = Number(want.DiscogsID);
  if (Number.isInteger(id) && id > 0) return `https://www.discogs.com/sell/release/${id}`;
  return `https://www.discogs.com/search/?${new URLSearchParams({ q: `${want.Artist ?? ""} ${want.AlbumName ?? ""}`.trim(), type: "all" })}`;
}

// "From 12.50 EUR · 7 for sale", as in the Streamlit app
export function priceText(price: MarketPrice | null | undefined): string {
  if (!price) return "";
  if (!price.forSale) return "None for sale on Discogs right now";
  const copies = `${price.forSale} for sale`;
  return price.lowest !== null ? `From ${price.lowest.toFixed(2)} ${price.currency} · ${copies}` : copies;
}

export function addedText(want: Pick<WantRow, "AddedAt">, now: Date = new Date()): string {
  const when = want.AddedAt ? new Date(want.AddedAt) : null;
  if (!when || Number.isNaN(when.getTime())) return "";
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (when.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return `Added ${when.toLocaleDateString("en-GB", options)}`;
}

// What Discogs knew when the want was saved, so Got it can open the usual Add sheet for that release
export function wantAsHit(want: WantRow): DiscogsHit | null {
  const id = Number(want.DiscogsID);
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    discogsId: id, artist: want.Artist ?? "", album: want.AlbumName ?? "", year: want.Year ?? "", genre: want.Genre ?? "",
    coverUrl: want.CoverURL ?? "", label: "", catalogNumber: "", format: "", country: "",
  };
}

// Prices for six hours in this browser tab, so the list opens quickly (the Streamlit app keeps them as long)
const cacheKey = "vinylWantPrices";
const cacheHours = 6;

type PriceCache = Record<string, { at: number; price: MarketPrice | null }>;

function readCache(): PriceCache {
  try {
    return JSON.parse(sessionStorage.getItem(cacheKey) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export async function fetchPrices(supabase: SupabaseClient, discogsIds: number[], now: number = Date.now()):
  Promise<Record<string, MarketPrice | null>> {
  const cache = readCache();
  const fresh = (id: number) => cache[id] && now - cache[id].at < cacheHours * 3600000;
  const missing = discogsIds.filter((id) => !fresh(id));
  if (missing.length) {
    const { prices } = await callLookup<{ prices: Record<string, MarketPrice | null> }>(supabase, { action: "prices", discogsIds: missing });
    for (const id of missing) cache[id] = { at: now, price: prices?.[id] ?? null };
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(cache));
    } catch {
      // no storage: prices are fetched again next time
    }
  }
  return Object.fromEntries(discogsIds.map((id) => [String(id), cache[id]?.price ?? null]));
}

export async function updateWant(supabase: SupabaseClient, id: number, change: Partial<WantRow>): Promise<WantRow> {
  const { data, error } = await supabase.from("Wantlist").update(change).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as WantRow;
}
