# Coming back from GitHub sign-in
import time
from pathlib import Path

import streamlit as st
from streamlit.testing.v1 import AppTest

from fakes import FakeSupabase
from vinyl.auth import pendingSignIns

appFile = str(Path(__file__).resolve().parent.parent / "vinylApp.py")


def test_sign_in_brings_you_back_to_the_page_you_left():
    st.cache_data.clear()
    pendingSignIns()["testKey"] = (FakeSupabase(), time.time(), {"section": "wants", "layout": "phone"})
    app = AppTest.from_file(appFile, default_timeout=30)
    app.query_params["signin"] = "testKey"
    app.query_params["code"] = "fromGitHub"
    app.run()
    assert not app.exception, app.exception[0].value
    assert app.session_state["signedInAs"] == "DxPerfection"
    assert app.session_state["section"] == "wants" and app.session_state["viewLayout"] == "Phone"
    assert "testKey" not in pendingSignIns()
