# GitHub sign-in in front of the app, kept in the browser so a refresh does not sign you out
import secrets
import time
import urllib.parse

import streamlit as st

from vinyl.config import getSecretsData
from vinyl.db import newSupabaseClient


# --- SIGN-IN ---
# Sign-in goes through Supabase Auth with GitHub. Only the GitHub account below gets in, and the database's
# Row Level Security rules (migrations/003_owner_only.sql) check the same account on every request.
ownerGithubId = str(getSecretsData("github_owner_id") or "26037275")  # DxPerfection
signInStoreKey = "signInStore"
signInParams = ("signin", "code", "error", "error_code", "error_description")


@st.cache_resource
def pendingSignIns():
    # Sign-ins waiting for GitHub to send you back. The page reloads on the way back, so the client that started
    # the sign-in (and its one-time code verifier) waits here on the server, under a random key, together with the
    # page address you signed in from.
    return {}


def appUrl():
    configured = getSecretsData("app_url")
    if configured:
        return configured.rstrip("/")
    parts = urllib.parse.urlsplit(st.context.url or "")
    return f"{parts.scheme}://{parts.netloc}{parts.path}".rstrip("/")


def githubLogin(user):
    for identity in user.identities or []:
        if identity.provider == "github":
            return (identity.identity_data or {}).get("user_name")
    return None


def isOwner(user):
    # Checked against what GitHub reported, which you cannot edit afterwards (unlike the profile metadata)
    for identity in user.identities or []:
        data = identity.identity_data or {}
        if identity.provider == "github" and ownerGithubId in (str(identity.id), str(data.get("provider_id")),
                                                               str(data.get("sub"))):
            return True
    return False


def signInLink():
    if "signInUrl" not in st.session_state:
        pending = pendingSignIns()
        for oldKey in [key for key, (_, startedAt, _) in pending.items() if time.time() - startedAt > 900]:
            pending.pop(oldKey, None)
        signInKey = secrets.token_urlsafe(16)
        client = newSupabaseClient()
        response = client.auth.sign_in_with_oauth(
            {"provider": "github", "options": {"redirect_to": f"{appUrl()}/?signin={signInKey}"}})
        returnTo = {name: value for name, value in st.query_params.items() if name not in signInParams}
        pending[signInKey] = (client, time.time(), returnTo)
        st.session_state["signInUrl"] = response.url
    return st.session_state["signInUrl"]


def finishSignIn():
    # GitHub (through Supabase) sends you back with ?signin=<key>&code=<code>; trade the code for a session
    params = {name: st.query_params.get(name) for name in signInParams}
    for name in signInParams:
        st.query_params.pop(name, None)
    pending = pendingSignIns().pop(params["signin"], None) if params["signin"] else None
    if params["error_description"] or params["error"]:
        return None, f"GitHub sign-in did not finish: {params['error_description'] or params['error']}"
    if not params["code"] or pending is None:
        return None, "That sign-in link has expired. Please sign in again."
    client, _, returnTo = pending
    st.query_params.update(returnTo)  # back to the section and layout you signed in from
    try:
        client.auth.exchange_code_for_session({"auth_code": params["code"]})
        return client, None
    except Exception as e:
        return None, f"Sign-in failed: {e}"


# The browser keeps your sign-in in its own storage, so a fresh page load does not ask again. Reading and writing
# happen in the browser and the value comes back to Python as component state. (A cookie did not work: the hosted
# app never received it.)
signInStoreJs = """
export default function(component) {
    const { data, setStateValue } = component;
    try {
        if (data.save !== null) {
            if (data.save) localStorage.setItem("vc_session", data.save); else localStorage.removeItem("vc_session");
        }
        const saved = localStorage.getItem("vc_session") || "";
        // Only report a change; reporting the same value again would rerun the app in a loop
        if (saved !== data.known) setStateValue("saved", saved);
    } catch (e) {
        if (data.known !== "") setStateValue("saved", "");
    }
    // While the sign-in page is open, a sign-in finished in another tab (GitHub may open one, for example from the
    // home screen app) is picked up here straight away
    if (data.save) return;
    const onStorage = (event) => {
        if (event.key === "vc_session" && event.newValue) setStateValue("saved", event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
}
"""


# GitHub sign-in opens in the same tab, so it brings you back to the page you left rather than to a second tab.
# On Streamlit Cloud the app sits in a frame that may not move the whole tab itself, so a link added to the outer
# page (which has the same address) does it. Where even that is not possible, the link opens a new tab as before.
signInHereJs = """
export default function() {
    const onClick = (event) => {
        const link = event.target.closest && event.target.closest(".st-key-signInButton a[href]");
        if (!link) return;
        event.preventDefault();
        try {
            const outerPage = window.top.document;
            const hop = outerPage.createElement("a");
            hop.href = link.href;
            outerPage.body.appendChild(hop);
            hop.click();
            hop.remove();
        } catch (e) {
            window.open(link.href, "_blank");
        }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
}
"""


def savedSignIn():
    # None until the browser has reported back, which it does right after the first page load
    return (st.session_state.get(signInStoreKey) or {}).get("saved")


def keepSignIn(token):
    # token: the sign-in to store, "" to forget it, or None to leave the browser's copy alone.
    # Supabase hands out new tokens when the old ones run out, so the stored copy is replaced when it changes.
    # Declared on every run, as Streamlit expects, rather than once when this module is first imported
    signInStore = st.components.v2.component("sign_in_store", js=signInStoreJs)
    signInStore(key=signInStoreKey, data={"save": token, "known": savedSignIn()}, on_saved_change=lambda: None)


def restoreSignIn():
    savedToken = savedSignIn()
    if not savedToken or savedToken == st.session_state.get("tokenTried"):
        return None
    st.session_state["tokenTried"] = savedToken
    client = newSupabaseClient()
    try:
        # Saved as "<access token> <refresh token>". The refresh token is only spent once the access token has run
        # out (after an hour), so most page loads leave the saved copy as it is.
        accessToken, refreshToken = savedToken.split(" ")
        client.auth.set_session(accessToken, refreshToken)
        return client
    except Exception:
        return None


def signOut():
    client = st.session_state.pop("supabase", None)
    if client:
        try:
            client.auth.sign_out({"scope": "local"})
        except Exception:
            pass
    for name in ("signInUrl", "signedInAs", "signInToken"):
        st.session_state.pop(name, None)
    st.session_state["tokenTried"] = savedSignIn()  # the saved sign-in was just ended, so do not reuse it


def showSignInPage(message=None):
    # Until the browser says whether it has a saved sign-in (a moment after the page opens), show a neutral
    # opening screen instead of flashing the sign-in button
    checking = savedSignIn() is None and not message
    subtitle = "Opening your records…" if checking else "Sign in to open your records."
    st.markdown(
        '<div class="vc-hero"><div class="vc-disc"></div><div><h1>Vinyl Collection</h1>'
        f'<p>{subtitle}</p></div></div>',
        unsafe_allow_html=True)
    if message:
        st.warning(message)
    if not checking:
        try:
            st.link_button("Sign in with GitHub", signInLink(), type="primary", key="signInButton")
            signInHere = st.components.v2.component("sign_in_here", js=signInHereJs)
            signInHere(key="signInHere")
        except Exception as e:
            st.error(f"GitHub sign-in is not available yet: {e}")
    # A saved sign-in that did not work (or was just signed out) is forgotten
    keepSignIn("" if savedSignIn() else None)
    st.stop()


def requireSignIn():
    message = None
    client = st.session_state.get("supabase")
    if any(name in st.query_params for name in ("signin", "code", "error")):
        client, message = finishSignIn()
        st.session_state.pop("signInUrl", None)
    if client is None:
        client = restoreSignIn()
    session = None
    if client is not None:
        try:
            session = client.auth.get_session()  # refreshes the session when it is about to run out
        except Exception:
            session = None
    if session is None:
        st.session_state.pop("supabase", None)
        # Kept for the next run too, since the browser's report on the saved sign-in reruns the page right away
        if message:
            st.session_state["signInMessage"] = message
        showSignInPage(st.session_state.get("signInMessage"))
    if not isOwner(session.user):
        login = githubLogin(session.user) or "that account"
        st.session_state["supabase"] = client
        signOut()
        st.session_state["signInMessage"] = f"You signed in as {login}, but this collection belongs to someone else."
        showSignInPage(st.session_state["signInMessage"])
    st.session_state.pop("signInMessage", None)
    st.session_state["supabase"] = client
    st.session_state["signedInAs"] = githubLogin(session.user) or "GitHub"
    st.session_state["signInToken"] = f"{session.access_token} {session.refresh_token}"
