// Everything that saves to Supabase from the screens. Each one saves first, then changes what is on screen, then
// shows a message; where a save can be taken back, the message has Undo.
import { useCallback } from "react";

import type { ToastMessage } from "../components/toast";
import { deleteRecord, deleteWant, insertRecord, insertWant, recordInfo, updateRecord } from "./addRecord";
import type { RecordView } from "./collectionView";
import type { ReleaseDetails } from "./lookup";
import { deletePlay, insertPlay, newPlayRow, type PlayPart } from "./plays";
import type { CollectionData, PlayRow, VinylRecord, WantRow } from "./records";
import { getSupabase } from "./supabaseClient";

type ShowToast = (text: string, extra?: Omit<ToastMessage, "id" | "text">) => void;
type UpdateData = (change: (data: CollectionData) => CollectionData) => void;

export interface Actions {
  logPlay: (record: RecordView, part: PlayPart, playedAt: Date) => Promise<boolean>;
  removePlay: (play: PlayRow) => Promise<void>;
  addRecord: (row: VinylRecord) => Promise<boolean>;
  addWant: (row: Omit<WantRow, "id">) => Promise<boolean>;
  matchRecord: (record: VinylRecord, release: ReleaseDetails) => Promise<boolean>;
}

export function useActions(updateData: UpdateData, showToast: ShowToast): Actions {
  const showError = useCallback((what: string, error: unknown) => {
    const reason = navigator.onLine ? (error instanceof Error ? error.message : String(error)) : "you're offline";
    showToast(`${what}: ${reason}`, { isError: true });
  }, [showToast]);

  const updatePlays = useCallback((change: (plays: PlayRow[]) => PlayRow[]) =>
    updateData((data) => ({ ...data, plays: change(data.plays) })), [updateData]);
  const updateRecords = useCallback((change: (records: VinylRecord[]) => VinylRecord[]) =>
    updateData((data) => ({ ...data, records: change(data.records) })), [updateData]);
  const updateWants = useCallback((change: (wants: WantRow[]) => WantRow[]) =>
    updateData((data) => ({ ...data, wants: change(data.wants) })), [updateData]);

  const logPlay = useCallback(async (record: RecordView, part: PlayPart, playedAt: Date) => {
    try {
      const saved = await insertPlay(getSupabase(), newPlayRow(record, part, playedAt));
      updatePlays((plays) => [...plays, saved]);
      const label = part === "Full album" ? record.AlbumName : `${record.AlbumName} (${part})`;
      showToast(`Logged ${label}`, {
        undo: async () => {
          try {
            await deletePlay(getSupabase(), saved.id);
            updatePlays((plays) => plays.filter((play) => play.id !== saved.id));
            showToast(`Took back ${label}`);
          } catch (error) {
            showError("Couldn't undo", error);
          }
        },
      });
      return true;
    } catch (error) {
      showError("Couldn't save the play", error);
      return false;
    }
  }, [showError, showToast, updatePlays]);

  // Undo saves the same play again (it gets a new id)
  const removePlay = useCallback(async (play: PlayRow) => {
    try {
      await deletePlay(getSupabase(), play.id);
      updatePlays((plays) => plays.filter((item) => item.id !== play.id));
      showToast(`Removed ${play.AlbumName ?? "the play"}`, {
        undo: async () => {
          try {
            const { id: _oldId, ...row } = play;
            const saved = await insertPlay(getSupabase(), row);
            updatePlays((plays) => [...plays, saved]);
          } catch (error) {
            showError("Couldn't put it back", error);
          }
        },
      });
    } catch (error) {
      showError("Couldn't delete the play", error);
    }
  }, [showError, showToast, updatePlays]);

  const addRecord = useCallback(async (row: VinylRecord) => {
    try {
      const saved = await insertRecord(getSupabase(), row);
      updateRecords((records) => [...records, saved]);
      showToast(`Added ${saved.AlbumName} to your collection`, {
        undo: async () => {
          try {
            await deleteRecord(getSupabase(), Number(saved.ID));
            updateRecords((records) => records.filter((record) => Number(record.ID) !== Number(saved.ID)));
            showToast(`Took ${saved.AlbumName} out again`);
          } catch (error) {
            showError("Couldn't undo", error);
          }
        },
      });
      return true;
    } catch (error) {
      showError("Couldn't add the record", error);
      return false;
    }
  }, [showError, showToast, updateRecords]);

  const addWant = useCallback(async (row: Omit<WantRow, "id">) => {
    try {
      const saved = await insertWant(getSupabase(), row);
      updateWants((wants) => [...wants, saved]);
      showToast(`Added ${saved.AlbumName} to your want list`, {
        undo: async () => {
          try {
            await deleteWant(getSupabase(), saved.id);
            updateWants((wants) => wants.filter((want) => want.id !== saved.id));
          } catch (error) {
            showError("Couldn't undo", error);
          }
        },
      });
      return true;
    } catch (error) {
      showError("Couldn't add it to the want list", error);
      return false;
    }
  }, [showError, showToast, updateWants]);

  // Saves only the record info; title, cover, length and tracklist stay as they are. Undo puts back what was there.
  const matchRecord = useCallback(async (record: VinylRecord, release: ReleaseDetails) => {
    const before = {
      DiscogsID: record.DiscogsID ?? null, Label: record.Label ?? null, CatalogNumber: record.CatalogNumber ?? null,
      Format: record.Format ?? null, Country: record.Country ?? null, SideMins: record.SideMins ?? null,
    };
    try {
      const saved = await updateRecord(getSupabase(), Number(record.ID), recordInfo(release));
      updateRecords((records) => records.map((item) => Number(item.ID) === Number(saved.ID) ? saved : item));
      showToast(`Saved the Discogs info for ${record.AlbumName}`, {
        undo: async () => {
          try {
            const restored = await updateRecord(getSupabase(), Number(record.ID), before);
            updateRecords((records) => records.map((item) => Number(item.ID) === Number(restored.ID) ? restored : item));
          } catch (error) {
            showError("Couldn't undo", error);
          }
        },
      });
      return true;
    } catch (error) {
      showError("Couldn't save the Discogs info", error);
      return false;
    }
  }, [showError, showToast, updateRecords]);

  return { logPlay, removePlay, addRecord, addWant, matchRecord };
}
