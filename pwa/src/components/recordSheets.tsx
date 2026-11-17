// The record card and the sheets it leads to (Edit, Match on Discogs), shared by Collection and Play.
// Matching a record that had no Discogs info carries straight on to the next one without it, so a whole shelf can be
// matched in one go; Skip moves on without saving and closing the sheet stops.
import { useState } from "react";

import type { RecordView } from "../lib/collectionView";
import type { VinylRecord } from "../lib/records";
import type { Actions } from "../lib/useActions";
import { EditSheet } from "./editSheet";
import { MatchSheet } from "./matchSheet";
import { RecordSheet } from "./recordSheet";

export type RecordActions = Pick<Actions, "logPlay" | "matchRecord" | "rateRecord" | "editRecord" | "removeRecord">;

interface RecordSheetsProps {
  records: RecordView[];
  rows: VinylRecord[];
  openId: number | null;
  onClose: () => void;
  actions: RecordActions;
  // The record IDs in the order the screen shows them, so matching carries on in that order
  matchOrder?: number[];
}

// The next record without Discogs info after the one just done, in screen order, wrapping round to the start
export function nextUnmatched(records: VinylRecord[], order: number[], doneId: number, leaveOut: number[]): number | null {
  const unmatched = new Set(records.filter((record) => !record.DiscogsID).map((record) => Number(record.ID)));
  for (const id of [doneId, ...leaveOut]) unmatched.delete(id);
  const ids = [...order.filter((id) => unmatched.has(id)), ...[...unmatched].filter((id) => !order.includes(id))];
  if (ids.length === 0) return null;
  const at = order.indexOf(doneId);
  return ids.find((id) => order.indexOf(id) > at) ?? ids[0];
}

export function RecordSheets({ records, rows, openId, onClose, actions, matchOrder }: RecordSheetsProps) {
  const [mode, setMode] = useState<"card" | "edit" | "match">("card");
  const [runId, setRunId] = useState<number | null>(null); // the record a run of matches has moved on to
  const [skipped, setSkipped] = useState<number[]>([]);
  const [matchedCount, setMatchedCount] = useState(0);
  const currentId = runId ?? openId;
  const record = currentId === null ? undefined : records.find((item) => Number(item.ID) === currentId);
  if (!record) return null;

  const close = () => { setMode("card"); setRunId(null); setSkipped([]); setMatchedCount(0); onClose(); };
  if (mode === "edit") {
    return <EditSheet record={record} records={rows} onSave={actions.editRecord} onDelete={actions.removeRecord} onClose={close} />;
  }
  if (mode === "match") {
    const order = matchOrder ?? records.map((item) => Number(item.ID));
    const id = Number(record.ID);
    const inRun = !record.DiscogsID;
    const left = rows.filter((item) => !item.DiscogsID).length;
    const moveOn = (leaveOut: number[]) => {
      const next = nextUnmatched(rows, order, id, leaveOut);
      if (next === null) close();
      else setRunId(next);
    };
    return (
      <MatchSheet key={id} record={record} onMatch={actions.matchRecord} onClose={close}
        run={inRun ? { left, matched: matchedCount } : undefined}
        onMatched={inRun ? () => { setMatchedCount((count) => count + 1); moveOn(skipped); } : close}
        onSkip={inRun ? () => { const leaveOut = [...skipped, id]; setSkipped(leaveOut); moveOn(leaveOut); } : undefined} />
    );
  }
  return (
    <RecordSheet record={record} onClose={close} onLog={actions.logPlay} onRate={actions.rateRecord}
      onMatch={() => setMode("match")} onEdit={() => setMode("edit")} />
  );
}
