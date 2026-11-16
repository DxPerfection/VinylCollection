// The app: sign-in first, then your records with the tab bar along the bottom
import { useCallback, useState } from "react";

import { AccountSheet } from "./components/accountSheet";
import { TabBar, type TabId } from "./components/tabBar";
import { Toast, type ToastMessage } from "./components/toast";
import type { RecordView } from "./lib/collectionView";
import { githubLogin, isOwner } from "./lib/owner";
import { deletePlay, insertPlay, newPlayRow, type PlayPart } from "./lib/plays";
import type { PlayRow } from "./lib/records";
import { getSupabase, isConfigured } from "./lib/supabaseClient";
import { useCollection } from "./lib/useCollection";
import { signInWithGithub, signOut, useSession } from "./lib/useSession";
import { CollectionScreen } from "./screens/collectionScreen";
import { ComingSoonScreen } from "./screens/comingSoonScreen";
import { NotOwnerScreen, OpeningScreen, ProblemScreen, SignInScreen } from "./screens/gateScreens";
import { PlaysScreen } from "./screens/playsScreen";

export function App() {
  if (!isConfigured()) {
    return <ProblemScreen title="Not set up yet"
      message="The Supabase address and key are missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the build settings." />;
  }
  return <SignedInGate />;
}

function SignedInGate() {
  const session = useSession();
  if (session.status === "loading") return <OpeningScreen />;
  if (session.status === "signedOut") return <SignInScreen error={session.error} onSignIn={signInWithGithub} />;
  const user = session.session.user;
  if (!isOwner(user)) return <NotOwnerScreen login={githubLogin(user)} onSignOut={signOut} />;
  return <Shell login={githubLogin(user)} />;
}

const tabFromAddress = (): TabId => {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return (["collection", "play", "plays", "wants", "stats"] as TabId[]).includes(tab as TabId) ? (tab as TabId) : "collection";
};

function Shell({ login }: { login: string }) {
  const { state, reload, updatePlays } = useCollection();
  const [tab, setTab] = useState<TabId>(tabFromAddress);
  const [accountOpen, setAccountOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, extra: Omit<ToastMessage, "id" | "text"> = {}) => {
    setToast({ id: Date.now() + Math.random(), text, ...extra });
  }, []);
  const showError = useCallback((what: string, error: unknown) => {
    const reason = navigator.onLine ? (error instanceof Error ? error.message : String(error)) : "you're offline";
    showToast(`${what}: ${reason}`, { isError: true });
  }, [showToast]);

  // Saves first, then shows the play; Undo deletes the row again
  const logPlay = useCallback(async (record: RecordView, part: PlayPart, playedAt: Date): Promise<boolean> => {
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

  // Deletes first; Undo saves the same play again (it gets a new id)
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

  const pickTab = (next: TabId) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "collection") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  let body;
  if (state.status === "loading") body = <OpeningScreen />;
  else if (state.status === "error") {
    body = <ProblemScreen title="Couldn't reach your records"
      message={navigator.onLine ? state.message : "You're offline. Your records will load when you're back online."}
      onRetry={reload} />;
  } else if (tab === "collection") {
    body = <CollectionScreen data={state.data} onOpenAccount={() => setAccountOpen(true)} onLog={logPlay} />;
  } else if (tab === "play") {
    body = <ComingSoonScreen title="What should I play?" oldSection="play"
      what="Picks a record for you by genre and how much time you have, favouring ones you haven't played for a while." />;
  } else if (tab === "plays") {
    body = <PlaysScreen data={state.data} onDelete={removePlay} />;
  } else if (tab === "wants") {
    body = <ComingSoonScreen title="Want list" oldSection="wants"
      what="Records you'd like to buy, with priority, notes and the lowest Discogs price." />;
  } else {
    body = <ComingSoonScreen title="Stats" oldSection="stats"
      what="Genres, decades, streaks, top artists, gathering dust and your year in review." />;
  }

  return (
    <div className="appShell">
      {body}
      {toast && <Toast toast={toast} onDone={() => setToast(null)} />}
      <TabBar current={tab} onPick={pickTab} />
      {accountOpen && (
        <AccountSheet login={login} onReload={reload} onSignOut={signOut} onClose={() => setAccountOpen(false)} />
      )}
    </div>
  );
}
