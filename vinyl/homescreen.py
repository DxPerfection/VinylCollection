# Lets the phone add the app to its home screen with its own icon and name, opening full screen like an app.
# On Streamlit Community Cloud the app runs in a frame inside Streamlit's own page, and the phone reads the icon and
# the app manifest from that outer page. Both pages share an address, so the browser code below adds the tags there.
import streamlit as st

homeScreenJs = """
export default function() {
    // Files in static/ are served next to the app at app/static/ (server.enableStaticServing in .streamlit/config.toml)
    const staticUrl = new URL("app/static/", document.baseURI).href;
    let page = document;
    try {
        if (window.top.document) page = window.top.document;
    } catch (e) {
        // The outer page is on another address (not the hosted app), so the app's own page gets the tags
    }
    const tags = [
        ["link", {rel: "manifest", href: staticUrl + "manifest.json", crossOrigin: "use-credentials"}],
        ["link", {rel: "apple-touch-icon", href: staticUrl + "apple-touch-icon.png"}],
        ["meta", {name: "theme-color", content: "#0B0B0F"}],
        ["meta", {name: "mobile-web-app-capable", content: "yes"}],
        ["meta", {name: "apple-mobile-web-app-capable", content: "yes"}],
        ["meta", {name: "apple-mobile-web-app-title", content: "Vinyl"}],
        ["meta", {name: "apple-mobile-web-app-status-bar-style", content: "black"}],
    ];
    for (const [tagName, attributes] of tags) {
        const which = attributes.rel ? `link[rel="${attributes.rel}"]` : `meta[name="${attributes.name}"]`;
        // Streamlit's own page may already have one (its logo as the icon), so ours replaces it
        page.head.querySelectorAll(which).forEach((old) => { if (!old.dataset.vinyl) old.remove(); });
        const tag = page.head.querySelector(which) || page.createElement(tagName);
        for (const [name, value] of Object.entries(attributes)) {
            if (tag[name] !== value) tag[name] = value;
        }
        // Added only once it is complete, since Chrome looks for the manifest when the tag arrives
        if (!tag.isConnected) {
            tag.dataset.vinyl = "1";
            page.head.appendChild(tag);
        }
    }
}
"""


def addHomeScreenTags():
    homeScreen = st.components.v2.component("home_screen_tags", js=homeScreenJs)
    homeScreen(key="homeScreenTags")
