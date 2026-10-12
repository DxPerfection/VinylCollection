# Page styling: the dark amber look, extra rules for the phone layout, and the placeholder cover
import urllib.parse

import streamlit as st

pageCss = """
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap');

    :root {
        --vc-bg: #0B0B0F; --vc-surface: #14141A; --vc-surface-2: #1B1B23; --vc-border: #2A2A35;
        --vc-text: #ECECF1; --vc-muted: #9A9AA8; --vc-accent: #F5B83D; --vc-teal: #3DD6C3;
    }
    html, body, .stApp, [data-testid="stAppViewContainer"] {font-family: 'Inter', sans-serif;}
    .stApp {background: radial-gradient(1200px 500px at 10% -10%, #1f1a10 0%, var(--vc-bg) 60%);}
    .block-container {padding-top: 2rem; max-width: 1280px;}
    header[data-testid="stHeader"] {background: transparent;}

    /* Hero */
    .vc-hero {display: flex; align-items: center; gap: 22px; margin-bottom: 1.4rem;}
    .vc-hero h1 {font-family: 'Playfair Display', serif; font-size: 2.6rem; margin: 0; padding: 0; color: var(--vc-text);}
    .vc-hero p {margin: 4px 0 0 0; color: var(--vc-muted);}
    .vc-disc {
        width: 74px; height: 74px; flex: none; border-radius: 50%;
        background:
            radial-gradient(circle, var(--vc-bg) 0 5%, var(--vc-accent) 6% 27%, #111 28% 30%, transparent 31%),
            repeating-radial-gradient(circle, #1c1c22 0 2px, #101015 2px 4px);
        box-shadow: 0 6px 24px rgba(245, 184, 61, 0.25), inset 0 0 0 2px #2b2b33;
        animation: vc-spin 14s linear infinite;
    }
    @keyframes vc-spin {to {transform: rotate(360deg);}}
    @media (prefers-reduced-motion: reduce) {.vc-disc {animation: none;}}

    /* Stat cards */
    .vc-stat {background: var(--vc-surface); border: 1px solid var(--vc-border); border-radius: 16px; padding: 16px 20px; min-height: 118px;}
    .vc-stat-label {color: var(--vc-muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em;}
    .vc-stat-value {color: var(--vc-text); font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 700; line-height: 1.25;
        font-variant-numeric: lining-nums;}
    .vc-stat-value-sm {font-size: 1.45rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
    .vc-stat-sub {color: var(--vc-accent); font-size: 0.82rem; min-height: 1.1em;}

    /* Tabs */
    .stTabs [data-baseweb="tab-list"] {gap: 6px; border-bottom: 1px solid var(--vc-border);}
    .stTabs [data-baseweb="tab"] {border-radius: 10px 10px 0 0; padding: 10px 16px; color: var(--vc-muted);}
    .stTabs [aria-selected="true"] {color: var(--vc-accent);}

    /* Cards */
    [class*="st-key-card_"] {
        background: var(--vc-surface); border: 1px solid var(--vc-border); border-radius: 16px; padding: 12px;
        transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }
    [class*="st-key-card_"]:hover {
        transform: translateY(-3px); border-color: var(--vc-accent); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
    }
    .vc-cover {aspect-ratio: 1 / 1; width: 100%; border-radius: 10px; overflow: hidden; background: var(--vc-surface-2);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);}
    .vc-cover img {width: 100%; height: 100%; object-fit: cover; display: block;}
    .vc-title {font-weight: 600; font-size: 1.02rem; margin: 12px 0 2px 0; color: var(--vc-text);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
    .vc-title-lg {font-family: 'Playfair Display', serif; font-size: 1.6rem; font-weight: 700; margin: 0; color: var(--vc-text);}
    .vc-artist {color: var(--vc-muted); font-size: 0.9rem; margin-bottom: 8px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
    .vc-pills {display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;}
    .vc-pill {background: var(--vc-surface-2); border: 1px solid var(--vc-border); color: var(--vc-muted);
        border-radius: 999px; padding: 2px 10px; font-size: 0.74rem;}
    .vc-pill-accent {color: var(--vc-accent); border-color: rgba(245, 184, 61, 0.4);}
    .vc-last {color: var(--vc-muted); font-size: 0.78rem; margin: -2px 0 10px 0;}
    .vc-banner {background: var(--vc-surface); border: 1px solid rgba(245, 184, 61, 0.4); border-radius: 12px;
        padding: 9px 14px; color: var(--vc-text);}
    .vc-hist {color: var(--vc-text); font-size: 0.92rem; padding: 6px 0;}
    .vc-hist-muted {color: var(--vc-muted);}
    .vc-count {color: var(--vc-muted); font-size: 0.85rem; margin: 4px 0 14px 0;}
    .vc-empty {text-align: center; padding: 56px 20px; border: 1px dashed var(--vc-border); border-radius: 16px;
        color: var(--vc-muted);}
    .tracklist-text {font-size: 14px; color: var(--vc-muted); margin-bottom: 2px;}
    .vc-meta {color: var(--vc-muted); font-size: 0.8rem; margin-bottom: 4px;}
    .vc-reason {color: var(--vc-accent); font-size: 0.98rem; margin: 8px 0 16px 0;}
    .vc-pick-cover {max-width: 320px;}

    /* Navigation and compact stat grid */
    .st-key-nav {margin: 2px 0 14px 0;}
    .vc-stat-grid {display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px;}
    .vc-stat-grid .vc-stat {min-height: 0; padding: 10px 14px; border-radius: 12px;}
    .vc-stat-grid .vc-stat-label {font-size: 0.68rem;}
    .vc-stat-grid .vc-stat-value {font-size: 1.35rem;}
    .vc-stat-grid .vc-stat-value-sm {font-size: 1.05rem;}
    .vc-stat-grid .vc-stat-sub {font-size: 0.72rem;}

    /* Controls */
    div[data-testid="stElementContainer"]:has(> div[data-testid="stButton"]),
    div[data-testid="stButton"], div[data-testid="stButton"] > button {width: 100% !important;}
    div[data-testid="stButton"] > button, div[data-testid="stDownloadButton"] > button {border-radius: 999px; font-weight: 500;}
    h2, h3 {font-family: 'Playfair Display', serif;}
    @media (max-width: 640px) {.vc-hero h1 {font-size: 1.9rem;} .vc-disc {width: 56px; height: 56px;}}
</style>
"""

# Extra rules for the phone layout, added only when it is on
phoneCss = """
<style>
    .block-container {padding: 1rem 0.8rem 3rem 0.8rem;}
    .vc-hero {gap: 12px; margin-bottom: 0.9rem;}
    .vc-hero h1 {font-size: 1.6rem;}
    .vc-hero p {display: none;}
    .vc-disc {width: 42px; height: 42px;}
    /* Columns inside these containers stay side by side instead of stacking */
    [class*="st-key-row_"] [data-testid="stHorizontalBlock"] {flex-wrap: nowrap; gap: 0.6rem;}
    [class*="st-key-row_"] [data-testid="stColumn"] {min-width: 0 !important; width: auto !important;}
    [class*="st-key-card_"] {padding: 8px; border-radius: 12px;}
    [class*="st-key-card_"]:hover {transform: none;}
    .vc-title {font-size: 0.9rem; margin-top: 8px;}
    .vc-artist {font-size: 0.8rem; margin-bottom: 2px;}
    .vc-title-lg {font-size: 1.15rem;}
    .vc-last {font-size: 0.74rem; margin-bottom: 6px;}
    .vc-hist {font-size: 0.86rem; padding: 2px 0;}
    .vc-pick-cover {max-width: 100%;}
    div[data-testid="stButton"] > button {min-height: 2.2rem; padding: 0.2rem 0.6rem;}
</style>
"""

# Inline vinyl record shown when a release has no cover image
placeholderCover = "data:image/svg+xml;utf8," + urllib.parse.quote(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#1B1B23'/>"
    "<circle cx='50' cy='50' r='44' fill='#101015' stroke='#2A2A35' stroke-width='1'/>"
    "<circle cx='50' cy='50' r='34' fill='none' stroke='#1c1c22' stroke-width='5'/>"
    "<circle cx='50' cy='50' r='15' fill='#F5B83D'/><circle cx='50' cy='50' r='2.5' fill='#0B0B0F'/></svg>")


def applyStyles():
    st.markdown(pageCss, unsafe_allow_html=True)


def applyPhoneStyles():
    st.markdown(phoneCss, unsafe_allow_html=True)
