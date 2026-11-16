// Keeps track of who is signed in. Signing in sends you to GitHub and back; the code in the address is traded
// for a session by the Supabase client, which then keeps it in the browser.
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

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
      if (data.session) setState({ status: "signedIn", session: data.session });
      else setState({ status: "signedOut", error: addressError ?? error?.message });
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState(session ? { status: "signedIn", session } : { status: "signedOut" });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signInWithGithub(): Promise<string | undefined> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${window.location.origin}/` },
  });
  return error?.message;
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}
