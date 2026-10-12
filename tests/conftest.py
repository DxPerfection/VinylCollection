import sys
from pathlib import Path

# Lets the tests import the vinyl package and the fakes next to them
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
