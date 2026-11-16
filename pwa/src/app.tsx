// The app: sign-in first, then your records with the tab bar along the bottom
import { useCallback, useState } from "react";

import { AccountSheet } from "./components/accountSheet";
import { TabBar, type TabId } from "./components/tabBar";
import { Toast, type ToastMessage } from "./components/toast";
import { githubLogin, isOwner } from "./lib/owner";
import { isConfigured } from "./lib/supabaseClient";
import { useActions } from "./lib/useActions";
import { useCollection } from "./lib/useCollection";
import { signInWithGithub, signOut, useSession } from "./lib/useSession";
import { AddScreen } from "./screens/addScreen";
import { CollectionScreen } from "./screens/collectionScreen";
import { ComingSoonScreen } from "./screens/comingSoonScreen";
import { NotOwnerScreen, OpeningScreen, ProblemScreen, SignInScreen } from "./screens/gateScreens";
import { PlayScreen } from "./screens/playScreen";
import { PlaysScreen } from "./screens/playsScreen";
import { WantsScreen } from "./screens/wantsScreen";

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
  const { state, reload, updateData } = useCollection();
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<TabId>(tabFromAddress);
  const [accountOpen, setAccountOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, extra: Omit<ToastMessage, "id" | "text"> = {}) => {
    setToast({ id: Date.now() + Math.random(), text, ...extra });
  }, []);

  const actions = useActions(updateData, showToast);

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
    body = <CollectionScreen data={state.data} onOpenAccount={() => setAccountOpen(true)} onOpenAdd={() => setAdding(true)}
      actions={actions} />;
  } else if (tab === "play") {
    body = <PlayScreen data={state.data} actions={actions} />;
  } else if (tab === "plays") {
    body = <PlaysScreen data={state.data} onDelete={actions.removePlay} />;
  } else if (tab === "wants") {
    body = <WantsScreen data={state.data} actions={actions} onOpenAdd={() => setAdding(true)} />;
  } else {
    body = <ComingSoonScreen title="Stats" oldSection="stats"
      what="Genres, decades, streaks, top artists, gathering dust and your year in review." />;
  }

  return (
    <div className="appShell">
      {body}
      {adding && state.status === "ready" && (
        <AddScreen data={state.data} actions={actions} onClose={() => setAdding(false)} />
      )}
      {toast && <Toast toast={toast} onDone={() => setToast(null)} />}
      <TabBar current={tab} onPick={pickTab} />
      {accountOpen && (
        <AccountSheet login={login} data={state.status === "ready" ? state.data : null} onReload={reload} onSignOut={signOut} onClose={() => setAccountOpen(false)} />
      )}
    </div>
  );
}
