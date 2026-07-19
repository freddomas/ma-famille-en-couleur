#!/usr/bin/env python3
"""Audite et recentre le contenu optique des paires de coloriages."""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = ROOT / "public"
MANIFEST_PATH = PUBLIC_ROOT / "assets" / "coloring" / "manifest.json"
DEFAULT_REPORT = ROOT / "qa" / "image-framing-report.json"
DEFAULT_CONTACT_DIR = ROOT / "qa" / "image-framing-contact-sheets"
INK_THRESHOLD = 180
MINIMUM_SHIFT = 3


def ink_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    pixels = np.asarray(image.convert("RGB"), dtype=np.uint8)
    ink = np.min(pixels, axis=2) < INK_THRESHOLD
    rows, columns = np.where(ink)
    if not rows.size or not columns.size:
        raise ValueError("Illustration sans trait détectable.")
    return (
        int(columns.min()),
        int(rows.min()),
        int(columns.max()) + 1,
        int(rows.max()) + 1,
    )


def frame_metrics(image: Image.Image) -> dict[str, object]:
    left, top, right, bottom = ink_bounds(image)
    width, height = image.size
    offset_x = round((width - left - right) / 2)
    offset_y = round((height - top - bottom) / 2)
    return {
        "bounds": [left, top, right, bottom],
        "offsetPixels": {"x": offset_x, "y": offset_y},
        "centerOffset": {
            "x": round(offset_x / width, 6),
            "y": round(offset_y / height, 6),
        },
        "contentRatio": {
            "width": round((right - left) / width, 6),
            "height": round((bottom - top) / height, 6),
        },
    }


def background_color(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    corners = [
        rgb.getpixel((0, 0)),
        rgb.getpixel((width - 1, 0)),
        rgb.getpixel((0, height - 1)),
        rgb.getpixel((width - 1, height - 1)),
    ]
    return tuple(
        int(statistics.median(pixel[channel] for pixel in corners))
        for channel in range(3)
    )


def sprite_artifact_boxes(
    image: Image.Image,
    origin: str,
) -> list[tuple[int, int, int, int]]:
    if origin != "gold-master-sprite":
        return []
    pixels = np.asarray(image.convert("RGB"), dtype=np.uint8)
    ink = np.min(pixels, axis=2) < INK_THRESHOLD
    labels, count = ndimage.label(
        ink,
        structure=np.ones((3, 3), dtype=np.uint8),
    )
    if count < 2:
        return []
    sizes = np.bincount(labels.ravel())
    component_boxes: dict[int, tuple[int, int, int, int]] = {}
    for label in range(1, count + 1):
        rows, columns = np.where(labels == label)
        if not rows.size:
            continue
        component_boxes[label] = (
            int(columns.min()),
            int(rows.min()),
            int(columns.max()) + 1,
            int(rows.max()) + 1,
        )
    largest_label = max(component_boxes, key=lambda label: int(sizes[label]))
    largest_right = component_boxes[largest_label][2]
    height, width = ink.shape
    total_ink = int(ink.sum())
    artifacts: list[tuple[int, int, int, int]] = []
    for label, box in component_boxes.items():
        if label == largest_label:
            continue
        area = int(sizes[label])
        component_width = box[2] - box[0]
        if (
            area >= 30
            and area < total_ink * 0.1
            and box[0] >= width * 0.86
            and component_width <= width * 0.12
            and box[0] > largest_right + 8
        ):
            artifacts.append(box)
    return artifacts


def clear_boxes(
    image: Image.Image,
    boxes: list[tuple[int, int, int, int]],
) -> Image.Image:
    output = image.convert("RGB").copy()
    draw = ImageDraw.Draw(output)
    fill = background_color(output)
    for left, top, right, bottom in boxes:
        draw.rectangle(
            (
                max(0, left - 3),
                max(0, top - 3),
                min(output.width - 1, right + 3),
                min(output.height - 1, bottom + 3),
            ),
            fill=fill,
        )
    return output


def translated(
    image: Image.Image,
    offset_x: int,
    offset_y: int,
) -> Image.Image:
    rgb = image.convert("RGB")
    output = Image.new("RGB", rgb.size, background_color(rgb))
    output.paste(rgb, (offset_x, offset_y))
    return output


def save_png(image: Image.Image, destination: Path) -> None:
    image.save(destination, format="PNG", optimize=True)


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def contact_sheet(entries: list[dict], catalogue_id: str, destination: Path) -> None:
    selected = [entry for entry in entries if entry["catalogueId"] == catalogue_id]
    columns = 5
    rows = 8
    tile_width = 320
    tile_height = 230
    art_size = 142
    sheet = Image.new(
        "RGB",
        (columns * tile_width, rows * tile_height),
        (240, 246, 243),
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for index, entry in enumerate(selected):
        column = index % columns
        row = index // columns
        tile_x = column * tile_width
        tile_y = row * tile_height
        active = Image.open(PUBLIC_ROOT / entry["path"]).convert("RGB")
        colored = Image.open(PUBLIC_ROOT / entry["coloredPath"]).convert("RGB")
        active = ImageOps.contain(active, (art_size, art_size), Image.Resampling.LANCZOS)
        colored = ImageOps.contain(colored, (art_size, art_size), Image.Resampling.LANCZOS)
        sheet.paste(active, (tile_x + 10, tile_y + 8))
        sheet.paste(colored, (tile_x + 168, tile_y + 8))
        draw.line(
            (tile_x + 159, tile_y + 8, tile_x + 159, tile_y + art_size + 8),
            fill=(181, 199, 192),
            width=1,
        )
        draw.text(
            (tile_x + 10, tile_y + 158),
            entry["id"],
            fill=(0, 52, 41),
            font=font,
        )
        draw.text(
            (tile_x + 10, tile_y + 176),
            entry["title"][:42],
            fill=(55, 73, 67),
            font=font,
        )
        draw.text(
            (tile_x + 10, tile_y + 198),
            "Traits",
            fill=(0, 52, 41),
            font=font,
        )
        draw.text(
            (tile_x + 168, tile_y + 198),
            "Guide couleur",
            fill=(0, 52, 41),
            font=font,
        )

    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, format="PNG", optimize=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Recentre les paires dont le décalage atteint trois pixels.",
    )
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--contact-dir", type=Path, default=DEFAULT_CONTACT_DIR)
    parser.add_argument(
        "--baseline-ref",
        default="HEAD",
        help="Révision Git servant à compter les paires réellement modifiées.",
    )
    return parser.parse_args()


def baseline_hashes(revision: str) -> dict[str, str]:
    result = subprocess.run(
        ["git", "show", f"{revision}:public/assets/coloring/manifest.json"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        return {}
    baseline = json.loads(result.stdout)
    return {entry["id"]: entry["sha256"] for entry in baseline["entries"]}


def main() -> int:
    args = parse_args()
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    previous_hashes = baseline_hashes(args.baseline_ref)
    results: list[dict[str, object]] = []
    shifted = 0
    artifacts_removed = 0

    for entry in manifest["entries"]:
        active_path = PUBLIC_ROOT / entry["path"]
        colored_path = PUBLIC_ROOT / entry["coloredPath"]
        active = Image.open(active_path).convert("RGB")
        colored = Image.open(colored_path).convert("RGB")
        if active.size != colored.size:
            raise ValueError(f"Dimensions de paire incohérentes pour {entry['id']}.")

        before = frame_metrics(active)
        artifacts = sprite_artifact_boxes(active, entry["origin"])
        if args.apply and artifacts:
            active = clear_boxes(active, artifacts)
            colored = clear_boxes(colored, artifacts)
            artifacts_removed += len(artifacts)

        cleaned = frame_metrics(active)
        offset_x = int(cleaned["offsetPixels"]["x"])
        offset_y = int(cleaned["offsetPixels"]["y"])
        should_shift = max(abs(offset_x), abs(offset_y)) >= MINIMUM_SHIFT

        if args.apply and (should_shift or artifacts):
            if should_shift:
                active = translated(active, offset_x, offset_y)
                colored = translated(colored, offset_x, offset_y)
                shifted += 1
            save_png(active, active_path)
            save_png(colored, colored_path)
            active = Image.open(active_path).convert("RGB")
            colored = Image.open(colored_path).convert("RGB")

        entry["sha256"] = file_sha256(active_path)
        results.append(
            {
                "id": entry["id"],
                "catalogueId": entry["catalogueId"],
                "page": entry["page"],
                "position": entry["position"],
                "title": entry["title"],
                "activePath": entry["path"],
                "coloredPath": entry["coloredPath"],
                "changedFromBaseline": (
                    previous_hashes.get(entry["id"]) != entry["sha256"]
                    if previous_hashes
                    else None
                ),
                "shiftApplied": {
                    "x": offset_x if args.apply and should_shift else 0,
                    "y": offset_y if args.apply and should_shift else 0,
                },
                "artifactBoxesRemoved": (
                    [list(box) for box in artifacts] if args.apply else []
                ),
                "before": before,
                "after": frame_metrics(active),
                "coloredAfter": frame_metrics(colored),
            }
        )

    if args.apply:
        MANIFEST_PATH.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    args.report.parent.mkdir(parents=True, exist_ok=True)
    maximum_after = max(
        max(
            abs(float(item["after"]["centerOffset"]["x"])),
            abs(float(item["after"]["centerOffset"]["y"])),
        )
        for item in results
    )
    changed_from_baseline = sum(
        item["changedFromBaseline"] is True for item in results
    )
    report = {
        "status": "passed",
        "method": "dark-pixel optical bounds; paired translation without scaling or crop",
        "entriesChecked": len(results),
        "pairsChecked": len(results),
        "imagesChecked": len(results) * 2,
        "pairsShiftedThisRun": shifted,
        "spriteArtifactsRemovedThisRun": artifacts_removed,
        "pairsChangedFromBaseline": changed_from_baseline,
        "baselineRef": args.baseline_ref if previous_hashes else None,
        "minimumShiftPixels": MINIMUM_SHIFT,
        "maximumCenterOffsetAfter": round(maximum_after, 6),
        "entries": results,
    }
    args.report.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    for catalogue_id in dict.fromkeys(
        entry["catalogueId"] for entry in manifest["entries"]
    ):
        contact_sheet(
            manifest["entries"],
            catalogue_id,
            args.contact_dir / f"{catalogue_id}.png",
        )

    print(
        json.dumps(
            {
                "status": report["status"],
                "pairsChecked": report["pairsChecked"],
                "imagesChecked": report["imagesChecked"],
                "pairsShiftedThisRun": report["pairsShiftedThisRun"],
                "spriteArtifactsRemovedThisRun": report[
                    "spriteArtifactsRemovedThisRun"
                ],
                "pairsChangedFromBaseline": report["pairsChangedFromBaseline"],
                "maximumCenterOffsetAfter": report["maximumCenterOffsetAfter"],
                "report": str(args.report.relative_to(ROOT)),
                "contactSheets": len(
                    list(args.contact_dir.glob("*.png"))
                ),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
