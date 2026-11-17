// Last.fm in the Account sheet: connect once, see what is waiting, send now, or disconnect
import { profileUrl } from "../lib/lastFm";
import type { LastFmHandle } from "../lib/useLastFm";
import { ExternalIcon } from "./icons";

type LastFmSectionProps = Pick<LastFmHandle, "link" | "queue" | "lastSentAt" | "sending" | "connect" | "disconnect" | "sendNow">;

export function LastFmSection({ link, queue, lastSentAt, sending, connect, disconnect, sendNow }: LastFmSectionProps) {
  const waitingTracks = queue.reduce((sum, item) => sum + item.scrobbles.length, 0);

  if (!link) {
    return (
      <section className="fieldGroup" aria-label="Last.fm">
        <span className="fieldLabel">Last.fm</span>
        <span className="muted tiny">
          Scrobble every play you log, track by track. You say yes once on Last.fm and come straight back here.
        </span>
        <button type="button" className="secondaryButton" onClick={() => { void connect(); }}>Connect Last.fm</button>
      </section>
    );
  }

  return (
    <section className="fieldGroup" aria-label="Last.fm">
      <span className="fieldLabel">Last.fm</span>
      <div className="lastFmStatus">
        <a href={profileUrl(link.name)} target="_blank" rel="noreferrer">
          Scrobbling as {link.name} <ExternalIcon />
        </a>
        {link.needsReconnect && (
          <span className="tiny errorText">Last.fm stopped taking scrobbles from this app. Connect again to send what is waiting.</span>
        )}
        <span className="muted tiny">
          {waitingTracks
            ? `${waitingTracks} ${waitingTracks === 1 ? "track" : "tracks"} from ${queue.length} ${queue.length === 1 ? "play" : "plays"} waiting. ` +
              "Tracks go out once they have played, whenever the app is open."
            : "Nothing waiting."}
          {lastSentAt ? ` Last sent at ${new Date(lastSentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.` : ""}
        </span>
      </div>
      <div className="lastFmButtons">
        {link.needsReconnect
          ? <button type="button" className="smallButton smallPrimary" onClick={() => { void connect(); }}>Connect again</button>
          : waitingTracks > 0 && (
            <button type="button" className="smallButton" disabled={sending} onClick={sendNow}>{sending ? "Sending…" : "Send now"}</button>
          )}
        <button type="button" className="smallButton" onClick={disconnect}>Disconnect</button>
      </div>
      <span className="muted tiny">
        Plays older than two weeks can't go to Last.fm. Deleting a play here can't remove it from Last.fm; the message
        after a delete links to that day there.
      </span>
    </section>
  );
}
