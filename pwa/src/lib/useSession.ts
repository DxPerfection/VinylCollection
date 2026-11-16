// Keeps track of who is signed in. Signing in sends you to GitHub and back; the code in the address is traded
// for a session by the Supabase client, which then keeps it in the browser.
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { clearCache } from "./offline";
import { getSupabase } from "./supabaseClient";

export type SessionState = { status: "loading" } | { status: "signedOut"; error?: string } | { status: "signedIn"; session: Session };

const signInParams = ["code", "error", "error_code", "error_description"];

function signInErrorFromAddress(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const message = params.get("error_description") || params.get("error");
  return message ? `GitHub sign-in did not finish: ${message}` : undefined;
}

function tidyAddress() {
  const url = new URL(window.location.href);
  if (!signInParams.some((name) => url.searchParams.has(name))) return;
  for (const name of signInParams) url.searchParams.delete(name);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    const supabase = getSupabase();
    const addressError = signInErrorFromAddress();
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      tidyAddress();
      const kept = data.session ?? (error && !navigator.onLine ? keptSession() : null);
      if (kept) setState({ status: "signedIn", session: kept });
      else setState({ status: "signedOut", error: addressError ?? error?.message });
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      // Offline, a sign-in that couldn't be renewed is not a sign-out; keep using the stored one
      if (!session && event !== "SIGNED_OUT" && !navigator.onLine && keptSession()) return;
      setState(session ? { status: "signedIn", session } : { status: "signedOut" });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

// Without a signal an expired sign-in can't be renewed, so the one kept in the browser is used to open the app with
// what is stored on the phone. Supabase renews it once the phone is back online.
export function keptSession(): Session | null {
  try {
    const key = Object.keys(localStorage).find((name) => /^sb-.+-auth-token$/.test(name));
    const stored = key ? JSON.parse(localStorage.getItem(key) ?? "null") : null;
    return stored?.access_token && stored?.user ? (stored as Session) : null;
  } catch {
    return null;
  }
}

export async function signInWithGithub(): Promise<string | undefined> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${window.location.origin}/` },
  });
  return error?.message;
}

// Plays still waiting to be sent are kept, so signing in again sends them
export async function signOut(): Promise<void> {
  clearCache();
  await getSupabase().auth.signOut();
}
