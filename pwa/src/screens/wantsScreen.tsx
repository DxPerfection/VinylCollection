// Want list: records you'd like to buy, highest priority first, with the lowest Discogs price
import { useEffect, useMemo, useState } from "react";

import { AddSheet } from "../components/addSheet";
import { CoverArt } from "../components/coverArt";
import { FindReleaseSheet } from "../components/findReleaseSheet";
import { PlusIcon } from "../components/icons";
import { WantSheet } from "../components/wantSheet";
import { isDuplicate } from "../lib/addRecord";
import { yearText } from "../lib/format";
import type { DiscogsHit } from "../lib/lookup";
import type { CollectionData, WantRow } from "../lib/records";
import { getSupabase } from "../lib/supabaseClient";
import type { Actions } from "../lib/useActions";
import { fetchPrices, type MarketPrice, priceText, priorityLabel, priorityOf, sortWants, wantAsHit } from "../lib/wants";

interface WantsScreenProps {
  data: CollectionData;
  actions: Pick<Actions, "editWant" | "removeWant" | "gotWant">;
  onOpenAdd: () => void;
}

type Step = { kind: "want" } | { kind: "find" } | { kind: "add"; hit: DiscogsHit };

export function WantsScreen({ data, actions, onOpenAdd }: WantsScreenProps) {
  const wants = useMemo(() => sortWants(data.wants), [data.wants]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [step, setStep] = useState<Step>({ kind: "want" });
  const prices = usePrices(wants);
  const open = openId === null ? undefined : wants.find((want) => want.id === openId);

  const close = () => { setOpenId(null); setStep({ kind: "want" }); };
  const gotIt = (want: WantRow) => {
    const hit = wantAsHit(want);
    setStep(hit ? { kind: "add", hit } : { kind: "find" });
  };

  return (
    <div className="screen">
      <header className="screenHeader">
        <div className="titleRow">
          <div>
            <h1>Want list</h1>
            <div className="muted small">{wants.length === 1 ? "1 record you want" : `${wants.length} records you want`}</div>
          </div>
          <button type="button" className="roundButton roundPrimary" aria-label="Add a record you want" onClick={onOpenAdd}>
            <PlusIcon />
          </button>
        </div>
      </header>
      <div className="scrollArea">
        {wants.length === 0 && (
          <p className="emptyNote">Nothing on your want list yet. Tap + and choose Want on a Discogs result.</p>
        )}
        <ul className="wantList">
          {wants.map((want) => (
            <li key={want.id}>
              <button type="button" className="wantRow" onClick={() => setOpenId(want.id)}>
                <CoverArt url={want.CoverURL} className="wantCover" />
                <span className="wantText">
                  <span className="playAlbum">{want.AlbumName}</span>
                  <span className="muted small">{[want.Artist, yearText(want.Year)].filter(Boolean).join(" · ")}</span>
                  {want.Note && <span className="muted tiny">{want.Note}</span>}
                  <span className="tiny priceLine">{priceLine(want, prices)}</span>
                </span>
                <span className={priorityOf(want) === 1 ? "priorityPill priorityHigh" : "priorityPill"}>{priorityLabel(want)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {open && step.kind === "want" && (
        <WantSheet want={open} price={prices.values[String(open.DiscogsID)]} inCollection={isDuplicate(open.Artist, open.AlbumName, data.records)}
          onSave={actions.editWant} onRemove={actions.removeWant} onGotIt={() => gotIt(open)} onClose={close} />
      )}
      {open && step.kind === "find" && (
        <FindReleaseSheet initialQuery={`${open.Artist ?? ""} ${open.AlbumName ?? ""}`.trim()}
          onPick={(hit) => setStep({ kind: "add", hit })} onClose={close} />
      )}
      {open && step.kind === "add" && (
        <AddSheet hit={step.hit} records={data.records} onAdd={(row) => actions.gotWant(open, row)} onClose={close} />
      )}
    </div>
  );
}

function priceLine(want: WantRow, prices: PriceState): string {
  if (!want.DiscogsID) return "";
  const price = prices.values[String(want.DiscogsID)];
  if (price !== undefined) return priceText(price);
  if (prices.status === "loading") return "Checking Discogs prices…";
  // Left out because Discogs was slow, or the whole call failed: it is asked for again next time
  return prices.status === "failed" ? "Couldn't check the price right now" : "Discogs was slow; price next time";
}

interface PriceState {
  status: "loading" | "done" | "failed";
  values: Record<string, MarketPrice | null>;
}

function usePrices(wants: WantRow[]): PriceState {
  const idsKey = wants.map((want) => Number(want.DiscogsID)).filter((id) => Number.isInteger(id) && id > 0).sort().join(",");
  const [state, setState] = useState<PriceState>({ status: "loading", values: {} });
  useEffect(() => {
    if (!idsKey) return setState({ status: "done", values: {} });
    let current = true;
    setState((previous) => ({ ...previous, status: "loading" }));
    fetchPrices(getSupabase(), idsKey.split(",").map(Number))
      .then((values) => current && setState({ status: "done", values }))
      .catch(() => current && setState((previous) => ({ ...previous, status: "failed" })));
    return () => { current = false; };
  }, [idsKey]);
  return state;
}
