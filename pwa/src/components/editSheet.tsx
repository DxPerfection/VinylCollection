// Changing a record's details, or deleting it (with Undo)
import { useMemo, useState } from "react";

import { conditions, knownGenres } from "../lib/addRecord";
import { changesFrom, editFormFrom, type EditForm, editProblem } from "../lib/manage";
import type { VinylRecord } from "../lib/records";
import { BottomSheet } from "./bottomSheet";
import { CoverArt } from "./coverArt";
import { TrashIcon } from "./icons";

interface EditSheetProps {
  record: VinylRecord;
  records: VinylRecord[];
  onSave: (record: VinylRecord, changes: Partial<VinylRecord>, records: VinylRecord[]) => Promise<boolean>;
  onDelete: (record: VinylRecord) => Promise<boolean>;
  onClose: () => void;
}

export function EditSheet({ record, records, onSave, onDelete, onClose }: EditSheetProps) {
  const known = useMemo(() => knownGenres(records), [records]);
  const [form, setForm] = useState<EditForm>(() => editFormFrom(record));
  const [otherGenre, setOtherGenre] = useState(() => Boolean(form.genre) && !known.includes(form.genre));
  const [busy, setBusy] = useState(false);

  const change = (field: keyof EditForm, value: string) => setForm({ ...form, [field]: value });
  const problem = editProblem(form, record, records);
  const changes = changesFrom(form, record, known);
  const changed = Object.keys(changes).length > 0;
  const conditionChoices = form.condition && !conditions.includes(form.condition) ? [...conditions, form.condition] : conditions;

  const save = async () => {
    if (problem || !changed) return;
    setBusy(true);
    const saved = await onSave(record, changes, records);
    setBusy(false);
    if (saved) onClose();
  };

  const remove = async () => {
    setBusy(true);
    const deleted = await onDelete(record);
    setBusy(false);
    if (deleted) onClose();
  };

  return (
    <BottomSheet label={`Edit ${record.AlbumName ?? "record"}`} onClose={onClose}>
      <div className="sheetHead">
        <CoverArt url={form.coverUrl} className="sheetCover" />
        <div className="sheetTitles">
          <h2 className="sheetAlbum">Edit record</h2>
          <div className="muted small">Changes save to the same record, so its plays stay with it.</div>
        </div>
      </div>

      <div className="formGrid">
        <label className="field"><span>Artist</span>
          <input value={form.artist} onChange={(event) => change("artist", event.target.value)} /></label>
        <label className="field"><span>Album</span>
          <input value={form.album} onChange={(event) => change("album", event.target.value)} /></label>
        <label className="field"><span>Year</span>
          <input inputMode="numeric" value={form.year} onChange={(event) => change("year", event.target.value)} /></label>
        <label className="field"><span>Length (min)</span>
          <input type="number" min={0} inputMode="numeric" value={form.durationMins}
            onChange={(event) => change("durationMins", event.target.value)} /></label>
      </div>

      <div className="fieldGroup" role="group" aria-label="Genre">
        <span className="fieldLabel">Genre</span>
        <div className="chipWrap">
          {known.map((genre) => (
            <button key={genre} type="button" className={!otherGenre && form.genre === genre ? "chip chipActive" : "chip"}
              aria-pressed={!otherGenre && form.genre === genre} onClick={() => { setOtherGenre(false); change("genre", genre); }}>
              {genre}
            </button>
          ))}
          <button type="button" className={otherGenre ? "chip chipActive" : "chip"} aria-pressed={otherGenre}
            onClick={() => { setOtherGenre(true); change("genre", ""); }}>Other…</button>
        </div>
        {otherGenre && (
          <label className="field"><span>Other genre</span>
            <input value={form.genre} onChange={(event) => change("genre", event.target.value)} /></label>
        )}
      </div>

      <label className="field"><span>Sub-genre</span>
        <input value={form.subGenre} onChange={(event) => change("subGenre", event.target.value)} /></label>

      <div className="fieldGroup" role="group" aria-label="Condition">
        <span className="fieldLabel">Condition</span>
        <div className="chipWrap">
          {conditionChoices.map((condition) => (
            <button key={condition} type="button" className={form.condition === condition ? "chip chipActive" : "chip"}
              aria-pressed={form.condition === condition} onClick={() => change("condition", condition)}>{condition}</button>
          ))}
        </div>
      </div>

      <label className="field"><span>Cover address</span>
        <input type="url" inputMode="url" value={form.coverUrl} onChange={(event) => change("coverUrl", event.target.value)} /></label>

      <label className="field"><span>Tracklist, one track per line</span>
        <textarea rows={6} value={form.tracks} onChange={(event) => change("tracks", event.target.value)} /></label>

      {problem && <p className="errorNote small" role="alert">{problem}</p>}
      <button type="button" className="primaryButton bigButton" disabled={busy || Boolean(problem) || !changed} onClick={save}>
        {busy ? "Saving…" : changed ? "Save changes" : "No changes yet"}
      </button>
      <button type="button" className="secondaryButton dangerButton" disabled={busy} onClick={remove}>
        <TrashIcon /> Delete this record
      </button>
      <p className="muted tiny">Deleting keeps its plays in your history, and you can undo it straight after.</p>
    </BottomSheet>
  );
}
