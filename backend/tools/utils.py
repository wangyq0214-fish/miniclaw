"""Shared utility functions for tools."""
import re
from datetime import date


def inject_date(path: str) -> str:
    """Auto-prepend system date to generated resource filenames.

    Matches paths like:
      workspace/generated/exercises/foo.json       →  workspace/generated/exercises/2026-05-04-foo.json
      workspace/generated/mindmaps/bar.json        →  workspace/generated/mindmaps/2026-05-04-bar.json
      workspace/generated/code-cases/rnn-basics/   →  workspace/generated/code-cases/2026-05-04-rnn-basics/

    Skips if the filename already starts with a YYYY-MM-DD prefix.
    """
    m = re.match(
        r"^(workspace/generated/[^/]+/)([^/]+?)(/?)$",
        path,
    )
    if not m:
        return path

    prefix, name, trailing_slash = m.group(1), m.group(2), m.group(3)

    if re.match(r"^\d{4}-\d{2}-\d{2}", name):
        return path

    today = date.today().isoformat()
    return f"{prefix}{today}-{name}{trailing_slash}"
