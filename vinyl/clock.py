# Timezone and layout defaults, and converting between your clock and the stored UTC times
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, available_timezones

import streamlit as st

from vinyl.config import fallbackTimezone


def defaultTimezone():
    # A timezone in the page address wins, then the browser's, then the fallback
    browserTimezone = getattr(st.context, "timezone", None)
    for candidate in (st.query_params.get("tz"), browserTimezone):
        if candidate in available_timezones():
            return candidate
    return fallbackTimezone


def defaultLayout():
    # The page address wins (?layout=phone), then the device: browsers that report a phone get the phone layout
    choice = str(st.query_params.get("layout", "")).capitalize()
    if choice in ("Phone", "Web"):
        return choice
    userAgent = getattr(st.context, "headers", {}).get("User-Agent", "") or ""
    return "Phone" if re.search(r"Mobile|Android|iPhone", userAgent) else "Web"


def displayTimezone():
    return st.session_state.get("displayTz") or defaultTimezone()


def localNow():
    # The current time on the wall clock of the chosen timezone
    return datetime.now(ZoneInfo(displayTimezone())).replace(tzinfo=None)


def toStoredTime(localTime):
    # Plays are stored in UTC with an explicit offset, so they read the same wherever the app runs
    utcTime = localTime.replace(tzinfo=ZoneInfo(displayTimezone())).astimezone(timezone.utc)
    return utcTime.strftime("%Y-%m-%dT%H:%M:00+00:00")
