// The screens shown before your records: opening, sign-in, someone else's account, and setup problems
import { type ReactNode, useState } from "react";

import { DiscArt, GithubMark } from "../components/icons";

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="gate">
      <div className="gateDisc"><DiscArt /></div>
      {children}
    </main>
  );
}

export function OpeningScreen({ text = "Opening your records…" }: { text?: string }) {
  return (
    <Centered>
      <p className="muted" role="status">{text}</p>
    </Centered>
  );
}

export function SignInScreen({ error, onSignIn }: { error?: string; onSignIn: () => Promise<string | undefined> }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(error);
  return (
    <Centered>
      <h1>Vinyl</h1>
      <p className="muted">Your records and everything you have spun.</p>
      <button type="button" className="primaryButton wide" disabled={busy} onClick={async () => {
        setBusy(true);
        const message = await onSignIn();
        if (message) {
          setProblem(message);
          setBusy(false);
        }
      }}>
        <GithubMark /> {busy ? "Opening GitHub…" : "Sign in with GitHub"}
      </button>
      {problem && <p className="errorNote" role="alert">{problem}</p>}
    </Centered>
  );
}

export function NotOwnerScreen({ login, onSignOut }: { login: string; onSignOut: () => void }) {
  return (
    <Centered>
      <h1>This app is private</h1>
      <p className="muted">You are signed in{login ? ` as ${login}` : ""}, but this collection belongs to someone else.</p>
      <button type="button" className="secondaryButton wide" onClick={onSignOut}>Sign out</button>
    </Centered>
  );
}

export function ProblemScreen({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <Centered>
      <h1>{title}</h1>
      <p className="muted">{message}</p>
      {onRetry && <button type="button" className="primaryButton wide" onClick={onRetry}>Try again</button>}
    </Centered>
  );
}
