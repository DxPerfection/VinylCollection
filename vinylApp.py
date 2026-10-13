# Vinyl Collection: the Streamlit entry point. It signs you in, draws the sidebar and menu, and hands the open
# section to its module in vinyl/sections. Shared code lives in the vinyl package.
from zoneinfo import available_timezones

import streamlit as st

from vinyl.appdata import loadAppData
from vinyl.auth import keepSignIn, requireSignIn, signOut
from vinyl.clock import defaultLayout, defaultTimezone
from vinyl.db import deletePlay
from vinyl.homescreen import addHomeScreenTags
from vinyl.sections import add, collection, dashboard, log, manage, play, wants
from vinyl.styles import applyPhoneStyles, applyStyles
from vinyl.ui import esc, saveAndRefresh, showTopStats

st.set_page_config(page_title="Vinyl Collection", page_icon="💿", layout="wide")
applyStyles()
addHomeScreenTags()

requireSignIn()


# --- SIDEBAR & REFRESH ---
# Stated again on every run: when the sidebar was hidden for a run (the sign-in page) or a run was cut short, Streamlit
# would otherwise draw these controls at their first option (Phone, Africa/Abidjan) while using the saved value
st.session_state["displayTz"] = st.session_state.get("displayTz") or defaultTimezone()
st.session_state["viewLayout"] = st.session_state.get("viewLayout") or defaultLayout()

with st.sidebar:
    st.header("Settings")
    if st.button("🔄 Refresh Data"):
        st.cache_data.clear()
        st.rerun()
    st.caption(f"Signed in as **{st.session_state['signedInAs']}**")
    if st.button("Sign out"):
        signOut()
        st.rerun()
    keepSignIn(st.session_state["signInToken"])
    st.radio("Layout", ["Phone", "Web"], key="viewLayout", horizontal=True,
             help="Phone fits a narrow screen. Web is the wide desktop layout.",
             on_change=lambda: st.query_params.update(layout=st.session_state["viewLayout"].lower()))
    st.selectbox("Timezone", sorted(available_timezones()), key="displayTz",
                 help="Listening times are shown on this clock.",
                 on_change=lambda: st.query_params.update(tz=st.session_state["displayTz"]))


phone = st.session_state["viewLayout"] == "Phone"
if phone:
    applyPhoneStyles()

# --- USER INTERFACE (UI) ---
if "flashMessage" in st.session_state:
    flashText, flashIcon = st.session_state.pop("flashMessage")
    st.toast(flashText, icon=flashIcon)

st.markdown(
    '<div class="vc-hero"><div class="vc-disc"></div><div><h1>Vinyl Collection</h1>'
    '<p>Your records and everything you have spun.</p></div></div>',
    unsafe_allow_html=True)

if "lastPlay" in st.session_state:
    lastPlay = st.session_state["lastPlay"]
    bannerHtml = f'<div class="vc-banner">🎧 Logged <b>{esc(lastPlay["label"])}</b> at {lastPlay["when"]}</div>'
    if phone:
        st.markdown(bannerHtml, unsafe_allow_html=True)
        bannerRow = st.container(key="row_banner")
        bannerUndo, bannerClose = bannerRow.columns(2)
    else:
        bannerText, bannerUndo, bannerClose = st.columns([7, 1.4, 1.6], vertical_alignment="center")
        bannerText.markdown(bannerHtml, unsafe_allow_html=True)
    if bannerUndo.button("Undo", key="undoLastPlay"):
        deletePlay(lastPlay["id"])
        st.session_state.pop("lastPlay")
        saveAndRefresh(f"Removed the play of {lastPlay['label']}", "↩️")
    if bannerClose.button("Dismiss", key="dismissLastPlay"):
        st.session_state.pop("lastPlay")
        st.rerun()
    st.write("")

app = loadAppData()

# --- NAVIGATION ---
# The open section lives in session state (and the page address), so saving something keeps you where you are.
# Only the open section is drawn, which also keeps each tap quick.
sections = {
    "collection": ("💿 Collection", "💿 Records"),
    "play": ("🎲 What to play", "🎲 Play"),
    "log": ("🎧 Listening Log", "🎧 Log"),
    "wants": ("🛒 Want list", "🛒 Wants"),
    "add": ("➕ Add New", "➕ Add"),
    "manage": ("⚙️ Manage", "⚙️ Manage"),
    "stats": ("📊 Dashboard", "📊 Stats"),
}
if "section" not in st.session_state:
    linkedSection = st.query_params.get("section")
    st.session_state["section"] = linkedSection if linkedSection in sections else "collection"


def openSection(navKey):
    # Tapping the open section again would clear the control, so it stays on the open section instead
    picked = st.session_state.get(navKey)
    if picked is None:
        st.session_state[navKey] = st.session_state["section"]
    else:
        st.session_state["section"] = picked


if not phone:
    showTopStats(app)
    st.write("")

navKey = f"nav_{st.session_state['viewLayout']}"
st.session_state[navKey] = st.session_state["section"]
with st.container(key="nav"):
    (st.pills if phone else st.segmented_control)(
        "Section", list(sections), key=navKey, label_visibility="collapsed", on_change=openSection, args=(navKey,),
        format_func=lambda name: sections[name][1 if phone else 0])
section = st.session_state["section"]
st.query_params["section"] = section

renderers = {"collection": collection.render, "play": play.render, "wants": wants.render, "add": add.render,
             "log": log.render, "manage": manage.render, "stats": dashboard.render}
renderers[section](app)
