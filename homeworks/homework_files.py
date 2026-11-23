"""Select consistently named homework files for PDF export."""

from pathlib import Path
import re


def parse_hw_stem(stem: str):
    stem = stem.removesuffix("__old")
    test = re.fullmatch(r"hw-test-(\d+)-review", stem, re.IGNORECASE)
    if test:
        return (10**9, int(test[1]), ())
    match = re.fullmatch(r"hw-(\d+)([a-z0-9-]*)", stem, re.IGNORECASE)
    if not match:
        raise ValueError(f"Invalid homework name: {stem!r}")
    chapter = int(match[1])
    tail = match[2].lstrip("-").lower()
    order = 0 if tail == "intro" else 2 if tail.endswith("review") else 1
    tokens = tuple(
        (0, int(part)) if part.isdigit() else (1, part)
        for part in re.findall(r"\d+|[a-z]+", tail)
    )
    return (chapter, order, tokens)


def parse_html_file(path: Path):
    if path.suffix.lower() != ".html":
        return None
    try:
        return parse_hw_stem(path.stem)
    except ValueError:
        return None


def sort_key(path: Path):
    parsed = parse_html_file(path)
    if parsed is None:
        raise ValueError(f"Unexpected filename format: {path.name}")
    return parsed


def get_files_in_range(folder: Path, start_name: str, end_name: str, include_old=False):
    start_key = parse_hw_stem(start_name)
    end_key = parse_hw_stem(end_name)
    if start_key > end_key:
        raise ValueError(f"START ({start_name}) comes after END ({end_name}).")
    return sorted(
        (
            file
            for file in folder.iterdir()
            if file.is_file()
            and (include_old or not file.stem.endswith("__old"))
            and (key := parse_html_file(file)) is not None
            and start_key <= key <= end_key
        ),
        key=sort_key,
    )
