// Loads the records and plays, and loads them again when the app comes back to the front after a while
import { useCallback, useEffect, useRef, useState } from "react";

import { type CollectionData, fetchCollection } from "./records";
import { getSupabase } from "./supabaseClient";

export type CollectionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CollectionData };

const staleAfterMs = 10 * 60 * 1000;

export function useCollection(): { state: CollectionState; reload: () => void } {
  const [state, setState] = useState<CollectionState>({ status: "loading" });
  const loadedAt = useRef(0);

  const load = useCallback(async (quiet: boolean) => {
    if (!quiet) setState({ status: "loading" });
    try {
      const data = await fetchCollection(getSupabase());
      loadedAt.current = Date.now();
      setState({ status: "ready", data });
    } catch (error) {
      // A quiet refresh that fails keeps showing what is already on screen
      if (!quiet) setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    load(false);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt.current > staleAfterMs) load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  return { state, reload: () => load(false) };
}
