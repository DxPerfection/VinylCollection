// Who is signed in, a way to sign out, and a link to the current app
import { oldAppLink } from "../lib/config";
import { BottomSheet } from "./bottomSheet";
import { ExternalIcon } from "./icons";

interface AccountSheetProps {
  login: string;
  onReload: () => void;
  onSignOut: () => void;
  onClose: () => void;
}

export function AccountSheet({ login, onReload, onSignOut, onClose }: AccountSheetProps) {
  return (
    <BottomSheet label="Account" onClose={onClose}>
      <h2 className="sheetAlbum">Signed in{login ? ` as ${login}` : ""}</h2>
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
