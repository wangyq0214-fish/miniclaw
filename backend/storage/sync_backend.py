"""
SyncFilesystemBackend - FilesystemBackend alias.

COS sync is limited to notes and source files (handled by api/notes.py and api/sources.py).
All other files (generated resources, memory, etc.) are local-only.
"""
from deepagents.backends.filesystem import FilesystemBackend


# No COS integration needed — just use FilesystemBackend directly
SyncFilesystemBackend = FilesystemBackend
