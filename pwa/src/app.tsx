// The app: sign-in first, then your records with the tab bar along the bottom
import { useState } from "react";

import { AccountSheet } from "./components/accountSheet";
import { TabBar, type TabId } from "./components/tabBar";
import { githubLogin, isOwner } from "./lib/owner";
import { isConfigured } from "./lib/supabaseClient";
import { useCollection } from "./lib/useCollection";
import { signInWithGithub, signOut, useSession } from "./lib/useSession";
import { CollectionScreen } from "./screens/collectionScreen";
import { ComingSoonScreen } from "./screens/comingSoonScreen";
import { NotOwnerScreen, OpeningScreen, ProblemScreen, SignInScreen } from "./screens/gateScreens";

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
  const { state, reload } = useCollection();
  const [tab, setTab] = useState<TabId>(tabFromAddress);
  const [accountOpen, setAccountOpen] = useState(false);

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
    body = <CollectionScreen data={state.data} onOpenAccount={() => setAccountOpen(true)} />;
  } else if (tab === "play") {
    body = <ComingSoonScreen title="What should I play?" oldSection="play"
      what="Picks a record for you by genre and how much time you have, favouring ones you haven't played for a while." />;
  } else if (tab === "plays") {
    body = <ComingSoonScreen title="Recent plays" oldSection="log"
      what="Everything you've listened to, newest first, with backdating and delete." />;
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
      <TabBar current={tab} onPick={pickTab} />
      {accountOpen && (
        <AccountSheet login={login} onReload={reload} onSignOut={signOut} onClose={() => setAccountOpen(false)} />
      )}
    </div>
  );
}
