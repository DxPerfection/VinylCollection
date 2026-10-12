# Discogs and Spotify lookups used when adding records
import base64

import requests
import streamlit as st

from vinyl.config import getSecretsData


# --- SPOTIFY API ---
def fetchSpotifyData(artistName, albumName):
    clientId = getSecretsData("spotify_client_id")
    clientSecret = getSecretsData("spotify_client_secret")

    if not clientId or not clientSecret:
        return "", 0

    try:
        authString = f"{clientId}:{clientSecret}"
        authBase64 = base64.b64encode(authString.encode("utf-8")).decode("utf-8")
        tokenUrl = "https://accounts.spotify.com/api/token"
        tokenHeaders = {"Authorization": f"Basic {authBase64}", "Content-Type": "application/x-www-form-urlencoded"}
        tokenData = {"grant_type": "client_credentials"}

        tokenResponse = requests.post(tokenUrl, headers=tokenHeaders, data=tokenData)
        tokenResponse.raise_for_status()
        accessToken = tokenResponse.json().get("access_token")

        searchQuery = f"artist:{artistName} album:{albumName}"
        searchUrl = "https://api.spotify.com/v1/search"
        searchHeaders = {"Authorization": f"Bearer {accessToken}"}
        searchParams = {"q": searchQuery, "type": "album", "limit": 1}

        searchResponse = requests.get(searchUrl, headers=searchHeaders, params=searchParams)
        searchResponse.raise_for_status()

        albumsData = searchResponse.json().get("albums", {}).get("items", [])
        if not albumsData:
            return "", 0

        targetAlbum = albumsData[0]

        imagesList = targetAlbum.get("images", [])
        spotifyCoverUrl = imagesList[0].get("url", "") if imagesList else ""

        albumId = targetAlbum.get("id")
        albumDetailsUrl = f"https://api.spotify.com/v1/albums/{albumId}"
        albumDetailsResponse = requests.get(albumDetailsUrl, headers=searchHeaders)
        albumDetailsResponse.raise_for_status()

        tracksList = albumDetailsResponse.json().get("tracks", {}).get("items", [])
        totalMilliseconds = sum(track.get("duration_ms", 0) for track in tracksList)
        spotifyDurationMins = totalMilliseconds // 60000

        return spotifyCoverUrl, spotifyDurationMins
    except Exception:
        return "", 0


# --- DISCOGS API ---
def searchDiscogsApi(searchQuery=None, barcodeQuery=None):
    apiToken = getSecretsData("discogs_token")
    if not apiToken:
        return []

    headersInfo = {"User-Agent": "VinylCollectionApp/3.0"}

    try:
        if barcodeQuery:
            apiUrl = f"https://api.discogs.com/database/search?barcode={barcodeQuery}&type=release&token={apiToken}"
        elif searchQuery:
            apiUrl = f"https://api.discogs.com/database/search?q={searchQuery}&type=release&token={apiToken}"
        else:
            return []

        apiResponse = requests.get(apiUrl, headers=headersInfo)
        apiResponse.raise_for_status()
        responseData = apiResponse.json()
        return responseData.get("results", [])[:10]
    except Exception as e:
        st.error(f"API Connection Error: {e}")
        return []


def fetchReleaseDetails(releaseId):
    apiToken = getSecretsData("discogs_token")
    if not apiToken:
        return 0, "", ""

    apiUrl = f"https://api.discogs.com/releases/{releaseId}?token={apiToken}"
    headersInfo = {"User-Agent": "VinylCollectionApp/3.0"}

    try:
        apiResponse = requests.get(apiUrl, headers=headersInfo)
        apiResponse.raise_for_status()
        responseData = apiResponse.json()

        totalSeconds = 0
        trackNames = []
        for track in responseData.get("tracklist", []):
            trackTitle = track.get("title", "")
            if trackTitle:
                trackNames.append(trackTitle)

            durationStr = track.get("duration", "")
            if durationStr and ":" in durationStr:
                try:
                    minutes, seconds = durationStr.split(":", 1)
                    totalSeconds += int(minutes) * 60 + int(seconds)
                except ValueError:
                    pass

        tracklistString = " | ".join(trackNames)

        styleList = responseData.get("styles", [])
        subGenreString = ", ".join(styleList) if styleList else ""

        return (totalSeconds // 60), tracklistString, subGenreString
    except Exception:
        return 0, "", ""


@st.cache_data(ttl=6 * 3600, show_spinner=False)
def fetchMarketplaceStats(releaseId):
    # Lowest price on the Discogs marketplace and how many copies are for sale: (price, currency, count),
    # or None when Discogs cannot say. Kept for six hours so the want list opens quickly.
    apiToken = getSecretsData("discogs_token")
    if not apiToken:
        return None
    currency = getSecretsData("discogs_currency") or "EUR"
    apiUrl = f"https://api.discogs.com/marketplace/stats/{int(releaseId)}"
    try:
        apiResponse = requests.get(apiUrl, headers={"User-Agent": "VinylCollectionApp/3.0"},
                                   params={"curr_abbr": currency, "token": apiToken}, timeout=10)
        apiResponse.raise_for_status()
        responseData = apiResponse.json()
    except Exception:
        return None
    lowest = responseData.get("lowest_price") or {}
    return lowest.get("value"), lowest.get("currency") or currency, int(responseData.get("num_for_sale") or 0)
