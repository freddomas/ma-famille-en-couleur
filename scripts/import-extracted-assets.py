from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = ROOT / "public"
EXTRACT_DIR = ROOT / "output" / "Extract"
SOURCE_MANIFEST = PUBLIC_ROOT / "assets" / "coloring" / "manifest.json"
METADATA_CSV = PUBLIC_ROOT / "data" / "extracted-assets.csv"
ACTIVE_DIR = PUBLIC_ROOT / "assets" / "coloring" / "active"
RESERVE_DIR = PUBLIC_ROOT / "assets" / "coloring" / "reserve"
FINAL_MANIFEST = PUBLIC_ROOT / "assets" / "coloring" / "manifest.json"
RESERVE_MANIFEST = RESERVE_DIR / "manifest.json"
CATALOGUES_JSON = PUBLIC_ROOT / "data" / "catalogues.json"
REPORT_JSON = ROOT / "qa" / "import-report.json"

EXPECTED_EXTRACTED = 360
EXPECTED_EXISTING = 120
EXPECTED_TOTAL = 480
ACTIVE_PER_CATEGORY = 40

CATEGORIES = [
    {
        "id": "animaux-familiers",
        "title": "Animaux familiers",
        "shortTitle": "Familiers",
        "eyebrow": "Compagnons & ferme",
        "description": "Des animaux doux et familiers à reconnaître puis à colorier.",
        "icon": "paw",
        "accent": "#E75B45",
        "soft": "#FFF0EA",
        "skills": ["Observation", "Vocabulaire"],
    },
    {
        "id": "animaux-sauvages",
        "title": "Animaux sauvages",
        "shortTitle": "Sauvages",
        "eyebrow": "Terre, mer & ciel",
        "description": "Des animaux sauvages, aquatiques et ailés aux silhouettes lisibles.",
        "icon": "paw",
        "accent": "#9A5B3F",
        "soft": "#F8EEE8",
        "skills": ["Observation", "Nature"],
    },
    {
        "id": "vehicules-terre",
        "title": "Véhicules terrestres",
        "shortTitle": "Sur terre",
        "eyebrow": "Roues & rails",
        "description": "Voitures, camions, trains et engins pour voyager sur la terre.",
        "icon": "car",
        "accent": "#3978D4",
        "soft": "#EAF3FF",
        "skills": ["Repérage", "Imagination"],
    },
    {
        "id": "vehicules-air-eau",
        "title": "Dans l’air et sur l’eau",
        "shortTitle": "Air & eau",
        "eyebrow": "Voler, flotter, explorer",
        "description": "Avions, bateaux, fusées et ballons pour partir à l’aventure.",
        "icon": "car",
        "accent": "#3D86A6",
        "soft": "#E9F7FB",
        "skills": ["Repérage", "Imagination"],
    },
    {
        "id": "fruits-gourmandises",
        "title": "Fruits & gourmandises",
        "shortTitle": "Saveurs",
        "eyebrow": "Du jardin au goûter",
        "description": "Des fruits et des douceurs aux grandes zones faciles à colorier.",
        "icon": "fruit",
        "accent": "#DD4F67",
        "soft": "#FFF0F3",
        "skills": ["Vocabulaire", "Alimentation"],
    },
    {
        "id": "nature-jardin",
        "title": "Nature & jardin",
        "shortTitle": "Nature",
        "eyebrow": "Plantes, ciel & potager",
        "description": "Le jardin, la météo et le monde vivant à observer en coloriant.",
        "icon": "leaf",
        "accent": "#2B8C69",
        "soft": "#E9F8F1",
        "skills": ["Nature", "Observation"],
    },
    {
        "id": "maison-objets",
        "title": "Ma maison & ses objets",
        "shortTitle": "Maison",
        "eyebrow": "Meubles & quotidien",
        "description": "Des meubles et objets familiers qui développent le vocabulaire.",
        "icon": "chair",
        "accent": "#A15C45",
        "soft": "#F8EFEA",
        "skills": ["Autonomie", "Vocabulaire"],
    },
    {
        "id": "batiments-lieux",
        "title": "École, ville & bâtiments",
        "shortTitle": "Les lieux",
        "eyebrow": "Habiter, apprendre, se repérer",
        "description": "Des maisons, des lieux publics et des objets de l’école.",
        "icon": "building",
        "accent": "#2F7D86",
        "soft": "#E8F6F7",
        "skills": ["Repérage", "Citoyenneté"],
    },
    {
        "id": "apprentissage",
        "title": "Chiffres, lettres & formes",
        "shortTitle": "J’apprends",
        "eyebrow": "Premiers repères",
        "description": "Des chiffres, lettres et formes simples à reconnaître et colorier.",
        "icon": "number",
        "accent": "#7B5CC7",
        "soft": "#F2EEFF",
        "skills": ["Calcul", "Concentration"],
    },
    {
        "id": "loisirs-decouvertes",
        "title": "Jeux & découvertes",
        "shortTitle": "Jeux",
        "eyebrow": "Jouer, créer, imaginer",
        "description": "Des jouets, instruments et objets de découverte pour nourrir l’imagination.",
        "icon": "spark",
        "accent": "#D66A24",
        "soft": "#FFF1E6",
        "skills": ["Expression", "Imagination"],
    },
]

CATEGORY_BY_ID = {category["id"]: category for category in CATEGORIES}

# Les changements ci-dessous équilibrent les dix catalogues sans falsifier le
# sujet : objets scolaires vers les lieux d’apprentissage, plantes comestibles
# vers les saveurs, insectes vers la nature et objets ludiques vers les jeux.
EXTRACT_CATEGORY_OVERRIDES = {
    10: "maison-objets",
    54: "maison-objets",
    11: "batiments-lieux",
    18: "batiments-lieux",
    191: "batiments-lieux",
    192: "batiments-lieux",
    193: "batiments-lieux",
    216: "batiments-lieux",
    255: "batiments-lieux",
    297: "batiments-lieux",
    298: "batiments-lieux",
    318: "batiments-lieux",
    28: "loisirs-decouvertes",
    172: "loisirs-decouvertes",
    200: "loisirs-decouvertes",
    251: "loisirs-decouvertes",
    275: "loisirs-decouvertes",
    46: "loisirs-decouvertes",
    66: "loisirs-decouvertes",
    162: "loisirs-decouvertes",
    217: "loisirs-decouvertes",
    265: "loisirs-decouvertes",
    42: "loisirs-decouvertes",
    102: "loisirs-decouvertes",
    121: "loisirs-decouvertes",
    123: "loisirs-decouvertes",
    38: "fruits-gourmandises",
    50: "fruits-gourmandises",
    51: "fruits-gourmandises",
    12: "nature-jardin",
    208: "nature-jardin",
    235: "nature-jardin",
    260: "nature-jardin",
    261: "nature-jardin",
}

FAMILIAR_ANIMAL_WORDS = (
    "chat",
    "chien",
    "lapin",
    "poule",
    "cheval",
    "vache",
    "chèvre",
    "mouton",
    "canard",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Classe, accentue la netteté et prépare le pool hebdomadaire."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    return parser.parse_args()


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower()
    return slug or "illustration"


def relative(path: Path) -> str:
    return path.relative_to(PUBLIC_ROOT).as_posix()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sharpness_score(image: Image.Image) -> float:
    array = np.asarray(image.convert("L"), dtype=np.float32)
    laplacian = (
        -4 * array
        + np.roll(array, 1, axis=0)
        + np.roll(array, -1, axis=0)
        + np.roll(array, 1, axis=1)
        + np.roll(array, -1, axis=1)
    )
    return float(laplacian[1:-1, 1:-1].var())


def load_extracted_metadata() -> list[dict]:
    with METADATA_CSV.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if len(rows) != EXPECTED_EXTRACTED:
        raise RuntimeError(
            f"{METADATA_CSV} contient {len(rows)} lignes, attendu {EXPECTED_EXTRACTED}."
        )
    indices = [int(row["index"]) for row in rows]
    if indices != list(range(1, EXPECTED_EXTRACTED + 1)):
        raise RuntimeError("Les indices du CSV doivent être continus de 1 à 360.")
    for row in rows:
        index = int(row["index"])
        row["index"] = index
        row["category"] = EXTRACT_CATEGORY_OVERRIDES.get(index, row["category"])
        if row["category"] not in CATEGORY_BY_ID:
            raise RuntimeError(f"Catégorie inconnue à l’index {index}: {row['category']}")
    return rows


def load_existing_records() -> list[dict]:
    manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    entries = manifest.get("entries", [])
    if len(entries) == 400 and RESERVE_MANIFEST.is_file():
        reserve = json.loads(RESERVE_MANIFEST.read_text(encoding="utf-8"))
        imported_pool = entries + reserve.get("entries", [])
        existing_entries = [
            entry
            for entry in imported_pool
            if entry.get("origin") != "output-extract-sharpened"
        ]
        if len(existing_entries) != EXPECTED_EXISTING:
            raise RuntimeError(
                "Le pool importé ne permet pas de retrouver les 120 actifs antérieurs."
            )
        return [
            {
                "sourceKind": "existing",
                "sourceName": entry["sourceName"],
                "sourcePath": PUBLIC_ROOT / entry["path"],
                "categoryId": entry.get("catalogueId") or entry.get("categoryId"),
                "title": entry["title"],
                "origin": entry["origin"],
            }
            for entry in existing_entries
        ]

    if len(entries) != EXPECTED_EXISTING:
        raise RuntimeError(
            f"Le manifeste source contient {len(entries)} actifs, attendu {EXPECTED_EXISTING}."
        )

    records = []
    for entry in entries:
        catalogue_id = entry["catalogueId"]
        title = entry["title"]
        if catalogue_id == "animaux":
            folded = title.casefold()
            category = (
                "animaux-familiers"
                if any(word in folded for word in FAMILIAR_ANIMAL_WORDS)
                else "animaux-sauvages"
            )
        elif catalogue_id == "vehicules":
            number = int(entry["id"].rsplit("-", 1)[1])
            category = "vehicules-air-eau" if 25 <= number <= 36 else "vehicules-terre"
        elif catalogue_id in {"chiffres", "formes"}:
            category = "apprentissage"
        elif catalogue_id == "fruits":
            category = "fruits-gourmandises"
        elif catalogue_id in {"legumes", "nature"}:
            category = "nature-jardin"
        elif catalogue_id == "maison":
            category = "maison-objets"
        elif catalogue_id == "ville":
            category = "batiments-lieux"
        elif catalogue_id == "metiers":
            category = "loisirs-decouvertes"
        else:
            raise RuntimeError(f"Catalogue source non géré : {catalogue_id}")

        source_path = PUBLIC_ROOT / entry["path"]
        if not source_path.is_file():
            raise RuntimeError(f"Actif existant manquant : {source_path}")
        records.append(
            {
                "sourceKind": "existing",
                "sourceName": f"existing-{catalogue_id}-{entry['id'].rsplit('-', 1)[1]}.png",
                "sourcePath": source_path,
                "categoryId": category,
                "title": title,
                "origin": entry["origin"],
            }
        )
    return records


def load_extracted_records(metadata: list[dict]) -> list[dict]:
    files = sorted(EXTRACT_DIR.glob("*.png"), key=lambda path: path.name.casefold())
    if len(files) != EXPECTED_EXTRACTED:
        raise RuntimeError(
            f"{EXTRACT_DIR} contient {len(files)} PNG, attendu {EXPECTED_EXTRACTED}."
        )
    return [
        {
            "sourceKind": "extracted",
            "sourceName": f"extract-{source.name}",
            "sourcePath": source,
            "categoryId": row["category"],
            "title": row["title"],
            "origin": "output-extract-sharpened",
            "extractIndex": row["index"],
        }
        for source, row in zip(files, metadata, strict=True)
    ]


def allocate(records: list[dict]) -> tuple[list[dict], list[dict], Counter]:
    counts = Counter(record["categoryId"] for record in records)
    insufficient = {
        category["id"]: counts[category["id"]]
        for category in CATEGORIES
        if counts[category["id"]] < ACTIVE_PER_CATEGORY
    }
    if insufficient:
        raise RuntimeError(f"Catégories insuffisantes : {insufficient}")

    active = []
    reserve = []
    for category in CATEGORIES:
        category_records = sorted(
            (record for record in records if record["categoryId"] == category["id"]),
            key=lambda record: record["sourceName"].casefold(),
        )
        active.extend(category_records[:ACTIVE_PER_CATEGORY])
        reserve.extend(category_records[ACTIVE_PER_CATEGORY:])
    return active, reserve, counts


def output_path(record: dict, pool: str, ordinal: int) -> Path:
    title_slug = slugify(record["title"])[:48]
    name = f"{ordinal:03d}-{title_slug}-{slugify(record['sourceName'])[:56]}.png"
    base = ACTIVE_DIR if pool == "active" else RESERVE_DIR
    return base / record["categoryId"] / name


def materialize(record: dict, destination: Path) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    before = None
    after = None
    if record["sourceKind"] == "extracted":
        with Image.open(record["sourcePath"]) as source:
            source.load()
            if source.format != "PNG":
                raise RuntimeError(f"Format inattendu : {record['sourcePath']}")
            before = sharpness_score(source)
            sharpened = source.filter(
                ImageFilter.UnsharpMask(radius=1.0, percent=95, threshold=3)
            )
            after = sharpness_score(sharpened)
            sharpened.save(destination, format="PNG", optimize=True, compress_level=9)
    else:
        shutil.copy2(record["sourcePath"], destination)

    with Image.open(destination) as result:
        result.load()
        width, height = result.size

    output = dict(record)
    output.update(
        {
            "path": relative(destination),
            "width": width,
            "height": height,
            "sha256": sha256(destination),
        }
    )
    if before is not None:
        output["sharpnessBefore"] = round(before, 3)
        output["sharpnessAfter"] = round(after, 3)
    return output


def catalogue_payload(active_records: list[dict]) -> tuple[dict, list[dict]]:
    entries = []
    catalogues = []
    for category in CATEGORIES:
        selected = [
            record for record in active_records if record["categoryId"] == category["id"]
        ]
        if len(selected) != ACTIVE_PER_CATEGORY:
            raise RuntimeError(f"{category['id']} ne contient pas 40 actifs.")
        catalogue = {
            "id": category["id"],
            "title": category["title"],
            "shortTitle": category["shortTitle"],
            "eyebrow": category["eyebrow"],
            "description": category["description"],
            "type": category["id"],
            "icon": category["icon"],
            "accent": category["accent"],
            "soft": category["soft"],
            "age": "2–3 ans",
            "skills": category["skills"],
            "items": [record["title"] for record in selected],
        }
        catalogues.append(catalogue)
        for index, record in enumerate(selected):
            entries.append(
                {
                    "id": f"{category['id']}-{index + 1:02d}",
                    "catalogueId": category["id"],
                    "catalogueTitle": category["title"],
                    "title": record["title"],
                    "page": index // 4 + 1,
                    "position": index % 4 + 1,
                    "path": record["path"],
                    "width": record["width"],
                    "height": record["height"],
                    "validationStatus": "validated",
                    "origin": record["origin"],
                    "sourceName": record["sourceName"],
                    "sha256": record["sha256"],
                    **(
                        {
                            "sharpnessBefore": record["sharpnessBefore"],
                            "sharpnessAfter": record["sharpnessAfter"],
                        }
                        if "sharpnessBefore" in record
                        else {}
                    ),
                }
            )

    data = {
        "meta": {
            "title": "Ma famille en couleur",
            "version": "3.0",
            "language": "fr",
            "catalogueCount": 10,
            "pagesPerCatalogue": 10,
            "drawingsPerPage": 4,
            "recommendedAges": "2–3 ans",
            "rotation": "weekly-ready",
        },
        "catalogues": catalogues,
    }
    return data, entries


def reserve_payload(reserve_records: list[dict]) -> list[dict]:
    counters = Counter()
    entries = []
    for record in sorted(
        reserve_records, key=lambda item: (item["categoryId"], item["sourceName"].casefold())
    ):
        counters[record["categoryId"]] += 1
        entries.append(
            {
                "id": f"reserve-{record['categoryId']}-{counters[record['categoryId']]:03d}",
                "categoryId": record["categoryId"],
                "title": record["title"],
                "path": record["path"],
                "width": record["width"],
                "height": record["height"],
                "validationStatus": "validated",
                "origin": record["origin"],
                "sourceName": record["sourceName"],
                "sha256": record["sha256"],
                **(
                    {
                        "sharpnessBefore": record["sharpnessBefore"],
                        "sharpnessAfter": record["sharpnessAfter"],
                    }
                    if "sharpnessBefore" in record
                    else {}
                ),
            }
        )
    return entries


def validate_hashes(entries: list[dict], label: str) -> None:
    hashes = [entry["sha256"] for entry in entries]
    duplicates = [value for value, count in Counter(hashes).items() if count > 1]
    if duplicates:
        raise RuntimeError(f"{label}: {len(duplicates)} doublons SHA-256 exacts.")


def main() -> int:
    args = parse_args()
    metadata = load_extracted_metadata()
    existing = load_existing_records()
    extracted = load_extracted_records(metadata)
    records = existing + extracted
    if len(records) != EXPECTED_TOTAL:
        raise RuntimeError(f"Pool total {len(records)}, attendu {EXPECTED_TOTAL}.")

    active, reserve, category_counts = allocate(records)
    if len(active) != 400 or len(reserve) != 80:
        raise RuntimeError(
            f"Allocation invalide : {len(active)} actifs et {len(reserve)} réserves."
        )

    dry_run_report = {
        "mode": "dry-run" if args.dry_run else "apply",
        "source": {
            "existing": len(existing),
            "extracted": len(extracted),
            "total": len(records),
        },
        "allocation": {
            "active": len(active),
            "reserve": len(reserve),
            "perCategory": dict(sorted(category_counts.items())),
        },
    }
    if args.dry_run:
        print(json.dumps(dry_run_report, ensure_ascii=False, indent=2))
        return 0

    if ACTIVE_DIR.exists() or RESERVE_DIR.exists():
        raise RuntimeError(
            "Les dossiers active/reserve existent déjà. Nettoyez-les explicitement avant --apply."
        )

    materialized_active = []
    for index, record in enumerate(active, start=1):
        materialized_active.append(
            materialize(record, output_path(record, "active", index))
        )
        if index % 40 == 0:
            print(f"Actifs préparés : {index} / 400", flush=True)

    materialized_reserve = []
    for index, record in enumerate(reserve, start=1):
        materialized_reserve.append(
            materialize(record, output_path(record, "reserve", index))
        )
        if index % 20 == 0:
            print(f"Réserve préparée : {index} / 80", flush=True)

    data, manifest_entries = catalogue_payload(materialized_active)
    reserve_entries = reserve_payload(materialized_reserve)
    validate_hashes(manifest_entries, "Actifs")
    validate_hashes(reserve_entries, "Réserve")
    validate_hashes(manifest_entries + reserve_entries, "Pool complet")

    generated_at = datetime.now(timezone.utc).isoformat()
    manifest = {
        "schemaVersion": 2,
        "generatedAt": generated_at,
        "expectedEntries": 400,
        "validatedEntries": len(manifest_entries),
        "complete": True,
        "rotation": {
            "strategy": "first-40-by-source-name-per-category",
            "reserveManifest": "assets/coloring/reserve/manifest.json",
        },
        "entries": manifest_entries,
        "missing": [],
    }
    reserve_manifest = {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "entries": reserve_entries,
    }
    report = {
        **dry_run_report,
        "generatedAt": generated_at,
        "sharpness": {
            "method": "Pillow UnsharpMask",
            "radius": 1.0,
            "percent": 95,
            "threshold": 3,
            "contentChanges": "sharpness-only",
            "processedExtractedFiles": EXPECTED_EXTRACTED,
        },
        "output": {
            "manifestEntries": len(manifest_entries),
            "reserveEntries": len(reserve_entries),
            "catalogues": len(data["catalogues"]),
        },
    }

    FINAL_MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    RESERVE_MANIFEST.write_text(
        json.dumps(reserve_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    CATALOGUES_JSON.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report["output"], ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERREUR: {error}", file=sys.stderr)
        raise
