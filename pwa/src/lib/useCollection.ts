// Loads the records and plays, and loads them again when the app comes back to the front after a while. The last
// load is kept on the phone, so the app opens straight away and still works without a signal; plays logged
// offline are sent as soon as Supabase can be reached again.
import { useCallback, useEffect, useRef, useState } from "react";

import { isConnectionProblem, isPending, readCache, readPending, removePending, stillToSend, writeCache } from "./offline";
import { insertPlay } from "./plays";
import { type CollectionData, fetchCollection } from "./records";
import { getSupabase } from "./supabaseClient";

export type CollectionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  // offlineSince: set while showing what was kept on the phone, to the time of that last load
  | { status: "ready"; data: CollectionData; offlineSince: string | null };

const staleAfterMs = 10 * 60 * 1000;
const retryPendingMs = 60 * 1000;

export interface CollectionHandle {
  state: CollectionState;
  reload: () => void;
  // Changes what is on screen straight after a save, without waiting for a reload
  updateData: (change: (data: CollectionData) => CollectionData) => void;
}

const withPending = (data: CollectionData): CollectionData => ({ ...data, plays: [...data.plays.filter((play) => !isPending(play)), ...readPending()] });

// What was kept on the phone. It shows at once while the fresh load runs; offlineSince is only set if that load fails.
function fromCache(offline = false): Extract<CollectionState, { status: "ready" }> | null {
  const cached = readCache();
  return cached ? { status: "ready", data: withPending(cached.data), offlineSince: offline ? cached.savedAt : null } : null;
}

// Sends the plays logged offline, oldest first. Stops at the first one that can't get through.
async function sendPending(saved: CollectionData): Promise<CollectionData> {
  const pending = readPending();
  const toSend = stillToSend(pending, saved.plays);
  for (const play of pending) if (!toSend.includes(play)) removePending(play.id);
  const plays = [...saved.plays];
  for (const play of toSend) {
    const { id, ...row } = play;
    try {
      plays.push(await insertPlay(getSupabase(), row));
      removePending(id);
    } catch (error) {
      if (isConnectionProblem(error)) break;
      removePending(id); // refused by the database: sending it again would never work
    }
  }
  return { ...saved, plays };
}

export function useCollection(): CollectionHandle {
  const [state, setState] = useState<CollectionState>(() => fromCache() ?? { status: "loading" });
  const loadedAt = useRef(0);
  const loading = useRef(false);

  const load = useCallback(async (quiet: boolean) => {
    if (loading.current) return;
    loading.current = true;
    if (!quiet) setState((current) => current.status === "ready" ? current : { status: "loading" });
    try {
      if (!navigator.onLine) throw new Error("You're offline.");
      const data = await sendPending(await fetchCollection(getSupabase()));
      loadedAt.current = Date.now();
      writeCache(data);
      setState({ status: "ready", data: withPending(data), offlineSince: null });
    } catch (error) {
      // Without a connection, keep showing what is on screen, or what was kept on the phone
      const cached = fromCache(true);
      setState((current) => {
        if (current.status === "ready") return { ...current, offlineSince: current.offlineSince ?? cached?.offlineSince ?? new Date().toISOString() };
        if (cached) return cached;
        return { status: "error", message: error instanceof Error ? error.message : String(error) };
      });
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    load(true);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt.current > staleAfterMs) load(true);
    };
    const onOnline = () => load(true);
    // While plays are waiting, try again every minute in case the phone thinks it is online but isn't
    const timer = window.setInterval(() => {
      if (readPending().length && navigator.onLine) load(true);
    }, retryPendingMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [load]);

  const updateData = useCallback((change: (data: CollectionData) => CollectionData) => {
    setState((current) => {
      if (current.status !== "ready") return current;
      const data = change(current.data);
      if (!current.offlineSince) writeCache(data); // keeps the phone's copy up to date after each save
      return { ...current, data };
    });
  }, []);

  return { state, reload: () => load(false), updateData };
}
