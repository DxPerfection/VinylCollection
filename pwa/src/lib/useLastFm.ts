// The Last.fm link for the whole app: connecting (the trip to Last.fm and back), the waiting list of scrobbles,
// and sending them whenever tracks have played, the phone is back online, or the app comes back to the front
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ToastMessage } from "../components/toast";
import {
  dropQueued, getConnectLink, getSessionKey, isLastFmProblem, nextDueAt, playStatus, putBack, queuePlay, readLink, readQueue,
  saveLink, scrobbleSender, scrobblesFor, sendQueued, tooOld, undoWindowMs, wasSent, clearQueue, type LastFmLink, type QueuedPlay,
} from "./lastFm";
import { playKey } from "./offline";
import type { PlayPart } from "./plays";
import type { PlayRow, VinylRecord } from "./records";
import { getSupabase } from "./supabaseClient";

type ShowToast = (text: string, extra?: Omit<ToastMessage, "id" | "text">) => void;

// What happened to a play's scrobbles when it was logged
export type QueueOutcome = "queued" | "tooOld" | "noTracks" | "off";

export interface LastFmHandle {
  link: LastFmLink | null;
  queue: QueuedPlay[];
  lastSentAt: number | null;
  sending: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendNow: () => void;
  queueForPlay: (play: PlayRow, record: VinylRecord, part: PlayPart, playedAt: Date, label: string) => QueueOutcome;
  // Takes a play's scrobbles off the waiting list; says whether any of them already went to Last.fm
  dropForPlay: (play: PlayRow) => { queued: QueuedPlay | null; sent: boolean };
  // Puts scrobbles taken off back on the list, for a play saved again under a new id (Undo of a delete)
  restore: (queued: QueuedPlay, play: PlayRow) => void;
  statusOf: (play: PlayRow) => "sent" | "waiting" | null;
}

const retryMs = 60 * 1000;

// Last.fm sends the browser back with ?token=...; it can be used once, so it is taken off the address straight away
// and only handled once even when React runs effects twice
let tokenTaken = false;
function takeToken(): string | null {
  if (tokenTaken) return null;
  const url = new URL(window.location.href);
  const token = url.searchParams.get("token");
  if (!token) return null;
  tokenTaken = true;
  url.searchParams.delete("token");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  return token;
}

export function useLastFm(showToast: ShowToast): LastFmHandle {
  const [version, setVersion] = useState(0);
  const [sending, setSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const busy = useRef(false);
  const timer = useRef<number | null>(null);
  // After a failed send (no signal, Last.fm slow or down), wait a minute before the next try
  const quietUntil = useRef(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const link = useMemo(() => readLink(), [version]);
  const queue = useMemo(() => readQueue(), [version]);

  const flush = useCallback(async () => {
    const current = readLink();
    if (busy.current || !current || current.needsReconnect || !readQueue().length) return;
    busy.current = true;
    setSending(true);
    try {
      const result = await sendQueued(scrobbleSender(getSupabase(), current.sessionKey));
      if (result.tracks) setLastSentAt(Date.now());
      quietUntil.current = result.problem ? Date.now() + retryMs : 0;
      if (result.problem?.kind === "reconnect") {
        saveLink({ ...current, needsReconnect: true });
        showToast("Last.fm stopped taking scrobbles from this app. Connect it again in Account.", { isError: true });
      } else if (result.problem?.kind === "notSetUp") {
        showToast("The Last.fm key isn't set up in Supabase, so scrobbles are waiting.", { isError: true });
      }
      if (result.dropped.length) {
        showToast(`Couldn't scrobble ${result.dropped.join(", ")} to Last.fm`, { isError: true });
      }
    } finally {
      busy.current = false;
      setSending(false);
      refresh();
    }
  }, [refresh, showToast]);

  // Try again when the next track will have played (at most a minute away, in case the phone slept)
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (!link || link.needsReconnect) return;
    const next = nextDueAt(queue);
    if (next === null) return;
    const wait = Math.max(next - Date.now() + 500, quietUntil.current - Date.now(), 1000);
    timer.current = window.setTimeout(() => { void flush(); }, Math.min(retryMs, wait));
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [flush, link, queue]);

  useEffect(() => {
    const token = takeToken();
    if (token) {
      getSessionKey(getSupabase(), token)
        .then(({ name, sessionKey }) => {
          saveLink({ name, sessionKey, connectedAt: new Date().toISOString() });
          showToast(`Connected to Last.fm as ${name}`);
          refresh();
          void flush();
        })
        .catch((error) => showToast(`Couldn't connect Last.fm: ${error instanceof Error ? error.message : String(error)}`, { isError: true }));
    } else {
      void flush();
    }
    const onOnline = () => { void flush(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush, refresh, showToast]);

  const connect = useCallback(async () => {
    try {
      window.location.href = await getConnectLink(getSupabase(), `${window.location.origin}/`);
    } catch (error) {
      const message = isLastFmProblem(error) && error.kind === "notSetUp"
        ? "The Last.fm key and secret aren't in Supabase yet."
        : error instanceof Error ? error.message : String(error);
      showToast(`Couldn't open Last.fm: ${message}`, { isError: true });
    }
  }, [showToast]);

  const disconnect = useCallback(() => {
    saveLink(null);
    clearQueue();
    refresh();
    showToast("Last.fm disconnected. New plays won't be scrobbled.");
  }, [refresh, showToast]);

  const queueForPlay = useCallback((play: PlayRow, record: VinylRecord, part: PlayPart, playedAt: Date, label: string): QueueOutcome => {
    const current = readLink();
    if (!current) return "off";
    const scrobbles = scrobblesFor(record, part, playedAt);
    if (!scrobbles.length) return "noTracks";
    if (tooOld(scrobbles)) return "tooOld";
    queuePlay({
      playId: Number(play.id), playKey: playKey(play), label, playedAt: playedAt.toISOString(), scrobbles,
      sendAfter: Date.now() + undoWindowMs,
    });
    refresh();
    return "queued";
  }, [refresh]);

  const dropForPlay = useCallback((play: PlayRow) => {
    const queued = dropQueued(play);
    refresh();
    return { queued, sent: wasSent(play) };
  }, [refresh]);

  const restore = useCallback((queued: QueuedPlay, play: PlayRow) => {
    putBack({ ...queued, playId: Number(play.id), playKey: playKey(play), sendAfter: Date.now() + undoWindowMs });
    refresh();
  }, [refresh]);

  const statusOf = useCallback((play: PlayRow) => playStatus(play, queue), [queue]);

  return {
    link, queue, lastSentAt, sending, connect, disconnect, queueForPlay, dropForPlay, restore, statusOf,
    sendNow: () => { void flush(); },
  };
}
