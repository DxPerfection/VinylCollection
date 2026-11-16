// Who is signed in, backups to download, reloading, a link to the current app, and signing out
import { backupFiles, downloadText } from "../lib/backup";
import { oldAppLink } from "../lib/config";
import type { CollectionData } from "../lib/records";
import { BottomSheet } from "./bottomSheet";
import { ExternalIcon } from "./icons";

interface AccountSheetProps {
  login: string;
  data: CollectionData | null;
  onReload: () => void;
  onSignOut: () => void;
  onClose: () => void;
}

export function AccountSheet({ login, data, onReload, onSignOut, onClose }: AccountSheetProps) {
  return (
    <BottomSheet label="Account" onClose={onClose}>
      <h2 className="sheetAlbum">Signed in{login ? ` as ${login}` : ""}</h2>

      {data && (
        <section className="fieldGroup" aria-label="Backups">
          <span className="fieldLabel">Download a backup (CSV)</span>
          <div className="backupButtons">
            {backupFiles(data).map((file) => (
              <button key={file.fileName} type="button" className="smallButton" onClick={() => downloadText(file.fileName, file.csv())}>
                {file.label} ({file.count})
              </button>
            ))}
          </div>
          <span className="muted tiny">
            The same files as the current app's Manage page, so its Restore can read them. A backup is also saved every Monday on its own.
          </span>
        </section>
      )}

      <button type="button" className="secondaryButton" onClick={() => { onReload(); onClose(); }}>
        Load my records again
      </button>
      <a className="secondaryButton" href={oldAppLink("collection")} target="_blank" rel="noreferrer">
        Open the current app <ExternalIcon />
      </a>
      <button type="button" className="secondaryButton" onClick={onSignOut}>Sign out</button>
    </BottomSheet>
  );
}
