import pandas as pd

from fakes import sampleTables
from vinyl.sections.wants import marketplaceUrl, priceText, priorityOf, sortWants


def test_high_priority_comes_first_then_newest():
    wants = pd.DataFrame([{"id": 1, "Priority": 3}, {"id": 2, "Priority": 1}, {"id": 3, "Priority": 3},
                          {"id": 4, "Priority": None}])
    assert list(sortWants(wants)["id"]) == [2, 4, 3, 1]


def test_priority_defaults_to_medium():
    assert priorityOf({"Priority": None}) == 2 and priorityOf({}) == 2 and priorityOf({"Priority": 1}) == 1


def test_price_text():
    assert priceText((12.5, "EUR", 7)) == "From 12.50 EUR · 7 for sale"
    assert priceText((None, "EUR", 0)) == "None for sale on Discogs right now"
    assert priceText(None) == ""


def test_marketplace_link_uses_the_release_when_known():
    nina, boards = sampleTables["Wantlist"]
    assert marketplaceUrl(boards) == "https://www.discogs.com/sell/release/123"
    assert marketplaceUrl(nina) == "https://www.discogs.com/search/?q=Nina+Simone+Pastel+Blues&type=all"
