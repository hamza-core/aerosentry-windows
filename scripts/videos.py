"""Where this computer keeps the test videos. They are NOT in the repository: team members already have them.
Accepted: a folder with  "Wall crossing" and "Normal class"  inside (the dataset's  dataset/test  folder)."""
from pathlib import Path

FOLDERS = {"crossing": ("Wall crossing", "crossing"), "normal": ("Normal class", "normal")}


def clip_dir(root, label):
    for name in FOLDERS[label]:
        folder = Path(root) / name
        if folder.is_dir():
            return folder
    return None


def looks_right(root):
    crossing = clip_dir(root, "crossing")
    return crossing is not None and (crossing / "43.mp4").exists() and clip_dir(root, "normal") is not None
