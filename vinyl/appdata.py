# The tables every section works from, read once per page load
from dataclasses import dataclass

import pandas as pd

from vinyl.db import fetchData
from vinyl.stats import buildPlayTable


@dataclass
class AppData:
    vinylData: pd.DataFrame
    historyData: pd.DataFrame
    wantData: pd.DataFrame | None  # None until migrations/002 has been run
    playsData: pd.DataFrame
    ratingsOn: bool


def loadAppData():
    vinylData = fetchData("Inventory")
    historyData = fetchData("ListeningHistory")
    wantData = fetchData("Wantlist", optional=True)
    return AppData(vinylData=vinylData, historyData=historyData, wantData=wantData,
                   playsData=buildPlayTable(historyData, vinylData), ratingsOn="Rating" in vinylData.columns)
