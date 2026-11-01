"""Vercel entry point: the whole FastAPI app as one Python function.

The project root is `apps/api`, so `app/` sits one level above this file; the
path is added explicitly because the function runs from its own directory.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402  (import needs the path above)
