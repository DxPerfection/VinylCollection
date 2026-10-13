# The files a phone needs to add the app to its home screen
import json
import tomllib
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent
staticDir = root / "static"


def test_static_files_are_served():
    config = tomllib.loads((root / ".streamlit" / "config.toml").read_text())
    assert config["server"]["enableStaticServing"] is True


def test_manifest_opens_the_app_full_screen():
    manifest = json.loads((staticDir / "manifest.json").read_text())
    assert manifest["name"] == "Vinyl Collection" and manifest["short_name"]
    assert manifest["display"] == "standalone"
    # The address root, so the hosted app opens Streamlit's page around the app rather than the bare frame
    assert manifest["start_url"] == manifest["scope"] == "/"


def test_every_icon_exists_at_its_stated_size():
    manifest = json.loads((staticDir / "manifest.json").read_text())
    sizes = set()
    for icon in manifest["icons"]:
        width, height = map(int, icon["sizes"].split("x"))
        with Image.open(staticDir / icon["src"]) as image:
            assert image.size == (width, height), icon["src"]
        sizes.add(width)
    # Android wants a 192 and a 512 pixel icon, and one that can be cut to any shape
    assert {192, 512} <= sizes
    assert any(icon.get("purpose") == "maskable" for icon in manifest["icons"])
    with Image.open(staticDir / "apple-touch-icon.png") as image:
        assert image.size == (180, 180)
