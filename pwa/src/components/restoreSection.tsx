// Restore from a backup: pick a CSV, see what would be added, then add it. Nothing in the app is changed or deleted.
import { useState } from "react";

import { type CollectionData, fetchCollection } from "../lib/records";
import { backupKind, type BackupKind, type CsvRow, insertInChunks, parseCsv, planRestore, planSummary, type RestorePlan, tableFor } from "../lib/restore";
import { getSupabase } from "../lib/supabaseClient";

interface Picked {
  fileName: string;
  kind: BackupKind;
  rows: CsvRow[];
  plan: RestorePlan<object>;
}

const nouns: Record<BackupKind, string> = { records: "records", plays: "plays", wants: "wants" };

export function RestoreSection({ data, onRestored }: { data: CollectionData; onRestored: () => void }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const pick = async (file: File | undefined) => {
    setMessage(null);
    setPicked(null);
    if (!file) return;
    const { columns, rows } = parseCsv(await file.text());
    const kind = backupKind(columns);
    if (!kind) {
      setMessage({ text: "That doesn't look like a backup from this app: it needs the columns of the records, listening history or want list file.", isError: true });
      return;
    }
    setPicked({ fileName: file.name, kind, rows, plan: planRestore(kind, rows, data) });
  };

  const restore = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      // Plan again on fresh data, so nothing already saved from another phone or the old app is added twice
      const supabase = getSupabase();
      const plan = planRestore(picked.kind, picked.rows, await fetchCollection(supabase));
      const { added, firstError } = await insertInChunks(supabase, tableFor[picked.kind], plan.toAdd);
      const noun = nouns[picked.kind];
      if (!plan.toAdd.length) setMessage({ text: "Nothing to restore: the app already has every row." });
      else if (added === plan.toAdd.length) setMessage({ text: `Restored ${added} ${noun}.` });
      else setMessage({ text: `Restored ${added} of ${plan.toAdd.length} ${noun}. The rest couldn't be saved: ${firstError}`, isError: true });
      setPicked(null);
      if (added) onRestored();
    } catch (error) {
      setMessage({ text: `Couldn't restore: ${navigator.onLine ? (error instanceof Error ? error.message : String(error)) : "you're offline"}`, isError: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="fieldGroup" aria-label="Restore from a backup">
      <span className="fieldLabel">Restore from a backup</span>
      <label className="smallButton filePick">
        Choose a CSV file
        <input type="file" accept=".csv,text/csv" className="visuallyHidden" onChange={(event) => { pick(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      {picked && (
        <div className="restorePlan">
          <span className="small"><strong>{picked.fileName}</strong> ({picked.kind === "wants" ? "want list" : picked.kind === "plays" ? "listening history" : "records"})</span>
          <span className="muted small">{planSummary(picked.plan)}</span>
          <div className="backupButtons">
            <button type="button" className="smallButton smallPrimary" disabled={!picked.plan.toAdd.length || saving} onClick={restore}>
              {saving ? "Restoring…" : `Restore ${picked.plan.toAdd.length} ${nouns[picked.kind]}`}
            </button>
            <button type="button" className="smallButton" disabled={saving} onClick={() => setPicked(null)}>Cancel</button>
          </div>
        </div>
      )}
      {message && <p className={message.isError ? "errorNote small" : "muted small"} role={message.isError ? "alert" : "status"}>{message.text}</p>}
      <span className="muted tiny">
        Only adds what's missing; nothing in the app is changed or deleted. Works with this app's backups, the current app's and the weekly ones.
      </span>
    </section>
  );
}
