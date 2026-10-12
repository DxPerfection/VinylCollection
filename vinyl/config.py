# Settings shared across the app, and reading secrets
import json

import streamlit as st

gridColumns = 4
fallbackTimezone = "Europe/Istanbul"  # used when the browser does not report its timezone
accentColor = "#F5B83D"
mutedColor = "#9A9AA8"


def getSecretsData(keyName):
    try:
        if keyName in st.secrets:
            return st.secrets[keyName]
    except Exception:
        pass

    try:
        with open("secrets.json", "r") as file:
            secretsData = json.load(file)
            if keyName in secretsData:
                return secretsData[keyName]
    except Exception:
        pass
    return None
