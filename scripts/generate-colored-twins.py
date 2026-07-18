#!/usr/bin/env python3
"""Génère les 400 guides colorés à partir des traits noirs actifs."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = ROOT / "public"
MANIFEST_PATH = PUBLIC_ROOT / "assets" / "coloring" / "manifest.json"
COLORED_ROOT = PUBLIC_ROOT / "assets" / "coloring" / "colored"
CONTACT_SHEET = ROOT / "qa" / "colored-guides-contact-sheet.jpg"

Color = tuple[int, int, int]

CATEGORY_PALETTES: dict[str, list[Color]] = {
    "animaux-familiers": [(205, 142, 76), (245, 220, 172), (160, 105, 60), (238, 164, 174)],
    "animaux-sauvages": [(216, 164, 72), (139, 101, 66), (100, 151, 105), (105, 157, 190)],
    "vehicules-terre": [(211, 68, 58), (55, 113, 181), (246, 190, 54), (57, 62, 67)],
    "vehicules-air-eau": [(54, 126, 185), (230, 72, 64), (240, 191, 55), (143, 101, 67)],
    "fruits-gourmandises": [(224, 62, 61), (244, 177, 48), (89, 153, 75), (142, 78, 145)],
    "nature-jardin": [(83, 155, 78), (244, 184, 50), (224, 92, 65), (95, 161, 196)],
    "maison-objets": [(166, 112, 72), (217, 181, 127), (88, 137, 170), (196, 92, 82)],
    "batiments-lieux": [(224, 177, 119), (185, 78, 66), (102, 151, 181), (103, 142, 86)],
    "apprentissage": [(224, 68, 63), (55, 120, 189), (247, 190, 49), (82, 158, 91)],
    "loisirs-decouvertes": [(231, 82, 71), (54, 126, 190), (247, 190, 49), (101, 161, 91)],
}

SUBJECT_PALETTES: list[tuple[tuple[str, ...], list[Color]]] = [
    (("banane",), [(246, 210, 55), (118, 151, 65), (126, 84, 50)]),
    (("fraise", "framboise"), [(224, 55, 59), (73, 145, 73), (246, 190, 55)]),
    (("carotte",), [(239, 120, 42), (67, 145, 70), (111, 81, 49)]),
    (("pomme",), [(211, 57, 54), (77, 145, 67), (119, 79, 45)]),
    (("poire",), [(172, 193, 67), (77, 145, 67), (119, 79, 45)]),
    (("raisin", "myrtille"), [(116, 76, 154), (76, 139, 71), (72, 103, 167)]),
    (("cerise",), [(194, 42, 55), (69, 139, 70), (116, 73, 44)]),
    (("pasteque",), [(226, 67, 66), (69, 143, 69), (36, 48, 40), (245, 224, 159)]),
    (("brocoli", "chou", "petits pois", "courgette"), [(64, 139, 68), (111, 174, 83), (198, 218, 112)]),
    (("tomate",), [(220, 54, 53), (61, 139, 67), (246, 178, 48)]),
    (("mais",), [(247, 202, 55), (77, 151, 69), (224, 170, 52)]),
    (("orange", "mangue", "papaye", "peche"), [(240, 139, 45), (72, 146, 70), (239, 92, 75)]),
    (("citron",), [(245, 211, 54), (75, 148, 69), (231, 177, 45)]),
    (("coco",), [(132, 88, 53), (246, 239, 215), (75, 146, 70)]),
    (("avocat",), [(77, 146, 69), (199, 205, 77), (133, 86, 48)]),
    (("grenade",), [(194, 43, 55), (230, 92, 72), (73, 143, 68)]),
    (("aubergine",), [(102, 65, 131), (67, 143, 69), (185, 117, 161)]),
    (("poivron",), [(213, 54, 51), (70, 146, 69), (244, 181, 49)]),
    (("betterave",), [(151, 45, 72), (74, 145, 71), (202, 86, 105)]),
    (("navet",), [(240, 231, 207), (139, 77, 145), (74, 146, 70)]),
    (("glace", "cupcake", "gateau"), [(238, 154, 174), (151, 94, 57), (247, 226, 173), (93, 160, 193)]),
    (("chat",), [(218, 146, 69), (247, 220, 171), (234, 148, 160), (99, 77, 59)]),
    (("chien",), [(174, 116, 66), (231, 197, 145), (89, 65, 47), (226, 147, 155)]),
    (("lapin",), [(203, 204, 199), (237, 163, 174), (246, 236, 211)]),
    (("poule", "coq", "poussin"), [(246, 215, 84), (205, 54, 48), (239, 151, 45), (245, 239, 214)]),
    (("cheval",), [(151, 94, 56), (76, 57, 42), (224, 190, 137)]),
    (("vache",), [(245, 241, 221), (52, 55, 54), (230, 153, 165), (116, 82, 53)]),
    (("chevre", "mouton"), [(239, 226, 190), (146, 116, 79), (184, 185, 176)]),
    (("canard",), [(244, 207, 62), (235, 137, 42), (78, 148, 76), (81, 128, 180)]),
    (("cochon",), [(235, 154, 165), (202, 108, 124), (124, 82, 62)]),
    (("hamster", "souris"), [(196, 150, 96), (238, 181, 185), (235, 220, 188)]),
    (("lion",), [(224, 171, 70), (139, 91, 48), (244, 211, 132)]),
    (("elephant", "rhinoceros", "hippopotame", "gorille"), [(154, 159, 158), (199, 169, 166), (102, 107, 105)]),
    (("girafe",), [(236, 190, 71), (151, 91, 45), (244, 220, 142)]),
    (("zebre", "panda"), [(244, 243, 225), (43, 48, 47), (124, 153, 104)]),
    (("singe", "ours", "herisson"), [(147, 96, 56), (214, 174, 112), (80, 62, 45)]),
    (("renard",), [(224, 104, 46), (245, 232, 202), (62, 54, 45)]),
    (("crocodile", "tortue", "cameleon", "serpent", "grenouille"), [(74, 148, 76), (139, 180, 78), (132, 93, 55), (238, 196, 53)]),
    (("dauphin", "baleine", "phoque"), [(83, 145, 181), (171, 198, 211), (56, 102, 144)]),
    (("poisson", "hippocampe"), [(238, 125, 53), (60, 139, 190), (245, 202, 61), (88, 161, 112)]),
    (("perroquet", "paon"), [(61, 145, 82), (51, 118, 185), (226, 58, 54), (246, 195, 53)]),
    (("hibou", "aigle"), [(142, 94, 55), (230, 202, 143), (245, 235, 207), (230, 170, 49)]),
    (("flamant",), [(233, 131, 157), (241, 184, 194), (70, 73, 70)]),
    (("papillon", "libellule"), [(58, 132, 190), (230, 70, 72), (246, 193, 49), (91, 160, 95)]),
    (("coccinelle",), [(220, 55, 53), (40, 46, 44), (73, 145, 68)]),
    (("abeille",), [(246, 195, 48), (47, 49, 46), (103, 164, 191)]),
    (("escargot",), [(191, 132, 72), (234, 191, 117), (83, 153, 79)]),
    (("soleil", "etoile"), [(247, 193, 45), (240, 139, 42), (91, 151, 193)]),
    (("lune",), [(222, 219, 189), (108, 139, 175), (246, 229, 138)]),
    (("nuage",), [(218, 232, 238), (126, 178, 206), (245, 245, 235)]),
    (("arc-en-ciel",), [(222, 61, 58), (239, 139, 42), (246, 198, 47), (70, 153, 78), (60, 132, 190), (129, 78, 157)]),
    (("fleur",), [(226, 74, 94), (245, 186, 51), (79, 151, 73), (155, 83, 157)]),
    (("arbre",), [(69, 145, 72), (134, 88, 51), (103, 164, 81)]),
    (("voiture", "taxi", "ambulance", "jeep", "pick-up", "4x4", "kart"), [(211, 60, 56), (80, 153, 193), (47, 52, 52), (244, 194, 52)]),
    (("pompier",), [(214, 54, 50), (244, 194, 49), (54, 58, 57), (111, 170, 198)]),
    (("police",), [(51, 103, 169), (241, 240, 224), (45, 50, 50), (211, 58, 54)]),
    (("bus", "minibus"), [(244, 187, 43), (64, 134, 183), (51, 55, 54), (225, 74, 59)]),
    (("camion",), [(224, 75, 58), (74, 133, 178), (49, 53, 52), (241, 185, 49)]),
    (("tracteur", "moissonneuse"), [(75, 143, 69), (239, 184, 44), (51, 55, 52)]),
    (("pelleteuse", "bulldozer", "grue"), [(239, 175, 40), (65, 71, 68), (205, 105, 48)]),
    (("velo", "moto", "scooter", "trottinette"), [(213, 61, 57), (55, 124, 181), (46, 51, 50), (239, 186, 48)]),
    (("train", "metro", "tramway"), [(57, 119, 180), (216, 62, 57), (236, 185, 48), (55, 59, 58)]),
    (("avion", "helicoptere", "hydravion"), [(67, 132, 185), (230, 77, 62), (238, 237, 220), (64, 69, 67)]),
    (("bateau", "voilier", "pirogue", "canoe", "barque", "ferry"), [(152, 96, 55), (57, 130, 185), (225, 68, 59), (242, 224, 173)]),
    (("sous-marin",), [(242, 184, 45), (74, 137, 180), (54, 59, 57)]),
    (("fusee", "rover", "soucoupe"), [(220, 62, 58), (225, 226, 217), (64, 126, 183), (242, 183, 45)]),
    (("montgolfiere", "dirigeable", "parachute"), [(222, 65, 60), (61, 130, 189), (244, 190, 48), (238, 235, 213)]),
    (("chaise", "table", "fauteuil", "canape", "armoire", "commode", "bibliotheque", "lit", "banc", "tabouret"), [(156, 102, 60), (216, 177, 122), (91, 137, 168), (184, 79, 70)]),
    (("maison", "ecole", "hopital", "magasin", "garage"), [(231, 190, 132), (184, 73, 62), (92, 145, 177), (103, 146, 85)]),
    (("chateau", "eglise", "pagode", "phare", "moulin", "tour", "immeuble", "gratte-ciel"), [(211, 185, 143), (167, 75, 62), (104, 147, 178), (111, 112, 105)]),
    (("sac a dos",), [(210, 66, 61), (56, 126, 185), (245, 188, 48)]),
    (("livre", "crayon"), [(219, 66, 61), (60, 130, 190), (245, 193, 49), (76, 151, 79)]),
    (("miroir", "baignoire", "refrigerateur"), [(204, 218, 220), (91, 154, 188), (240, 237, 216)]),
    (("horloge", "reveil", "appareil photo"), [(66, 71, 69), (207, 70, 61), (231, 188, 67)]),
    (("parapluie", "cadeau", "ballon", "cerf-volant"), [(224, 62, 58), (56, 128, 190), (246, 193, 49), (79, 154, 85)]),
    (("piano",), [(54, 57, 55), (239, 236, 215), (157, 99, 58)]),
    (("tambour", "xylophone", "crayons"), [(224, 64, 60), (56, 130, 190), (245, 191, 46), (79, 154, 83)]),
    (("ours en peluche",), [(174, 112, 64), (229, 186, 128), (214, 67, 65)]),
    (("pingouin",), [(44, 50, 49), (244, 239, 218), (237, 151, 43)]),
    (("maitresse", "maitre", "medecin", "infirmier"), [(176, 112, 73), (239, 185, 142), (58, 128, 185), (230, 72, 65), (246, 237, 215)]),
]

SKY_WORDS = (
    "soleil", "lune", "nuage", "arc-en-ciel", "avion", "helicoptere",
    "montgolfiere", "dirigeable", "parachute", "fusee",
)


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFD", value)
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def palette_for(title: str, category: str) -> list[Color]:
    normalized = normalize(title)
    for words, palette in SUBJECT_PALETTES:
        if any(word in normalized for word in words):
            return palette
    if re.search(r"\b(chiffre|lettre|cercle|carre|triangle|rectangle|forme)\b", normalized):
        return CATEGORY_PALETTES["apprentissage"]
    return CATEGORY_PALETTES[category]


def background_for(title: str, category: str) -> Color:
    normalized = normalize(title)
    if any(word in normalized for word in SKY_WORDS):
        return (224, 241, 249)
    if any(word in normalized for word in ("bateau", "voilier", "pirogue", "canoe", "ferry", "dauphin", "baleine")):
        return (225, 242, 248)
    if category in {"nature-jardin"}:
        return (246, 250, 239)
    return (253, 251, 245)


def colored_path_for(entry: dict) -> Path:
    source = Path(entry["path"])
    return COLORED_ROOT / entry["catalogueId"] / f"{source.stem}-colored.png"


def colorize(source: Path, destination: Path, title: str, category: str) -> dict:
    image = Image.open(source).convert("RGB")
    rgb = np.asarray(image, dtype=np.uint8)
    gray = np.asarray(image.convert("L"), dtype=np.uint8)

    barrier = gray < 205
    barrier = ndimage.binary_closing(barrier, structure=np.ones((3, 3), dtype=bool))
    labels, count = ndimage.label(~barrier)
    sizes = np.bincount(labels.ravel(), minlength=count + 1)

    border_labels = set(np.unique(np.concatenate((
        labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1],
    ))).tolist())
    min_area = max(32, int(gray.size * 0.00012))
    regions = [
        label
        for label in range(1, count + 1)
        if label not in border_labels and sizes[label] >= min_area
    ]
    regions.sort(key=lambda label: int(sizes[label]), reverse=True)

    output = np.empty_like(rgb)
    output[:] = background_for(title, category)
    palette = palette_for(title, category)
    for index, label in enumerate(regions):
        color = palette[index % len(palette)]
        mask = labels == label
        shade = gray[mask].astype(np.float32)[:, None] / 255.0
        output[mask] = np.clip(np.asarray(color, dtype=np.float32) * shade, 0, 255).astype(np.uint8)

    # Les petites zones fermées restent blanches (yeux, reflets, dents).
    untouched = (labels > 0) & ~np.isin(labels, np.asarray(regions, dtype=labels.dtype))
    output[untouched] = rgb[untouched]
    # Les traits originaux sont restaurés exactement.
    output[gray < 205] = rgb[gray < 205]

    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(output, mode="RGB").save(destination, format="PNG", optimize=True)
    return {
        "regionsColored": len(regions),
        "width": image.width,
        "height": image.height,
    }


def build_contact_sheet(entries: list[dict]) -> None:
    samples: list[dict] = []
    seen: dict[str, int] = {}
    for entry in entries:
        count = seen.get(entry["catalogueId"], 0)
        if count < 4:
            samples.append(entry)
            seen[entry["catalogueId"]] = count + 1

    tile = 230
    caption = 44
    columns = 5
    rows = (len(samples) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile, rows * (tile + caption)), (246, 242, 233))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, entry in enumerate(samples):
        x = (index % columns) * tile
        y = (index // columns) * (tile + caption)
        image = Image.open(PUBLIC_ROOT / entry["coloredPath"]).convert("RGB")
        image.thumbnail((tile - 18, tile - 18), Image.Resampling.LANCZOS)
        sheet.paste(image, (x + (tile - image.width) // 2, y + (tile - image.height) // 2))
        draw.text((x + 8, y + tile + 4), entry["title"], fill=(22, 48, 42), font=font)
        draw.text((x + 8, y + tile + 21), entry["catalogueId"], fill=(92, 105, 100), font=font)
    CONTACT_SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(CONTACT_SHEET, quality=90, optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    entries = manifest["entries"]
    selected = entries[: args.limit] if args.limit else entries
    report = []
    for index, entry in enumerate(selected, start=1):
        destination = colored_path_for(entry)
        result = colorize(
            PUBLIC_ROOT / entry["path"],
            destination,
            entry["title"],
            entry["catalogueId"],
        )
        entry["coloredPath"] = destination.relative_to(PUBLIC_ROOT).as_posix()
        report.append({"id": entry["id"], "coloredPath": entry["coloredPath"], **result})
        if index % 40 == 0 or index == len(selected):
            print(f"{index}/{len(selected)} guides colorés")

    if not args.limit:
        MANIFEST_PATH.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        build_contact_sheet(entries)
        report_path = ROOT / "qa" / "colored-guides-report.json"
        report_path.write_text(
            json.dumps(
                {
                    "status": "passed",
                    "generated": len(report),
                    "contactSheet": CONTACT_SHEET.relative_to(ROOT).as_posix(),
                    "entries": report,
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
