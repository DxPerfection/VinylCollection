// The record card and the sheets it leads to (Edit, Match on Discogs), shared by Collection and Play
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
}

export function RecordSheets({ records, rows, openId, onClose, actions }: RecordSheetsProps) {
  const [mode, setMode] = useState<"card" | "edit" | "match">("card");
  const record = openId === null ? undefined : records.find((item) => Number(item.ID) === openId);
  if (!record) return null;

  const close = () => { setMode("card"); onClose(); };
  if (mode === "edit") {
    return <EditSheet record={record} records={rows} onSave={actions.editRecord} onDelete={actions.removeRecord} onClose={close} />;
  }
  if (mode === "match") return <MatchSheet record={record} onMatch={actions.matchRecord} onClose={close} />;
  return (
    <RecordSheet record={record} onClose={close} onLog={actions.logPlay} onRate={actions.rateRecord}
      onMatch={() => setMode("match")} onEdit={() => setMode("edit")} />
  );
}
