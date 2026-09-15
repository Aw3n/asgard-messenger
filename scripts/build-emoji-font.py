#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Génère le sous-ensemble de police émoji embarqué par Asgard.

Pourquoi : un émoji est un caractère, pas une icône — il faut une police pour le
dessiner. Windows installe Segoe UI Emoji, macOS installe Apple Color Emoji, mais
Linux n'en impose aucune : sur une installation neuve, `fc-list | grep -ci emoji`
renvoie 0 et tout émoji de CONTENU (réaction envoyée sur le réseau, smiley converti,
caractère tapé par l'utilisateur) s'affiche en rectangle vide. Les icônes, elles,
sont passées en SVG (src/components/ui/Icon.tsx) ; le contenu, lui, ne peut pas :
ce sont des données échangées entre pairs. La réponse est donc une police de
repli embarquée, nommée « Asgard Emoji » et placée en fin de pile, après les
polices système : elle ne sert que pour les glyphes qu'aucune police précédente
ne sait dessiner.

Source : OpenMoji 17.0.0, https://github.com/hfg-gmuend/openmoji, licence
CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Le sous-ensemble
est une œuvre dérivée : il reste sous CC BY-SA 4.0, d'où le fichier
assets/fonts/LICENSE-OpenMoji.txt écrit ici même et embarqué dans le paquet.

La liste des glyphes n'est pas dans ce fichier : elle vit dans
scripts/emoji-subset.json, que lit aussi le verrou check-no-emoji-icons.mjs.

Empreinte dans le dépôt : aucune. L'archive source est téléchargée dans le
répertoire temporaire du système, jamais dans le dépôt — seuls les 16 Ko du
sous-ensemble sont versionnés. L'usage :

    python scripts/build-emoji-font.py [--force]

Sur une machine sans Python : inutile de régénérer, la police produite est dans
le dépôt. Il faut Python + `pip install fonttools brotli` seulement pour la refaire.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = json.load(open(os.path.join(ROOT, "scripts", "emoji-subset.json"), encoding="utf-8"))
CACHE = os.path.join(tempfile.gettempdir(), "asgard-emoji-src")


def step(msg):
    print("[emoji-font] " + msg)


def die(msg):
    print("[emoji-font] ERREUR : " + msg, file=sys.stderr)
    sys.exit(1)


def source_ttf(force):
    """Récupère l'archive officielle et en extrait la variante COLRv0."""
    os.makedirs(CACHE, exist_ok=True)
    ttf = os.path.join(CACHE, os.path.basename(SPEC["source"]["entry"]))
    if os.path.exists(ttf) and not force:
        step("source déjà en cache : " + ttf)
        return ttf
    try:
        from fontTools.ttLib import TTFont  # noqa: F401
    except ImportError:
        die("fontTools est requis pour régénérer la police : pip install fonttools brotli")
    archive = os.path.join(CACHE, SPEC["source"]["zipName"])
    if not os.path.exists(archive) or force:
        step("téléchargement de " + SPEC["source"]["zipUrl"])
        with urllib.request.urlopen(SPEC["source"]["zipUrl"], timeout=600) as r, open(archive + ".part", "wb") as w:
            shutil.copyfileobj(r, w)
        os.replace(archive + ".part", archive)
    step("archive : %.1f Mo" % (os.path.getsize(archive) / 1048576))
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        if SPEC["source"]["entry"] not in names:
            die("entrée %s absente de l'archive (contenu : %s…)" % (SPEC["source"]["entry"], ", ".join(names[:4])))
        with z.open(SPEC["source"]["entry"]) as r, open(ttf + ".part", "wb") as w:
            shutil.copyfileobj(r, w)
    os.replace(ttf + ".part", ttf)
    return ttf


def subset(ttf, out, codes):
    """Sous-ensemble par fontTools, puis vérification du résultat."""
    cmd = [
        sys.executable, "-m", "fontTools.subset", ttf,
        "--unicodes=" + ",".join("u" + c for c in codes),
        "--output-file=" + out,
        "--flavor=woff2",
        "--ignore-missing-unicodes",
        # 0 droit d'auteur, 8 fabricant, 13 licence, 14 URL de licence : ceux-là
        # restent intacts, l'attribution doit voyager dans le binaire.
        "--name-IDs=0,1,2,3,4,6,8,11,13,14",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        die("pyftsubset a échoué : " + (r.stderr or r.stdout).strip()[:600])
    from fontTools.ttLib import TTFont
    font = TTFont(out)
    cmap = {format(c, "X") for c in font.getBestCmap()}
    missing = [c for c in codes if c not in cmap]
    color = [t for t in font.keys() if t in ("COLR", "CPAL", "CBDT", "CBLC", "SVG ")]
    return missing, color


def rename(out):
    """
    Renomme la famille du sous-ensemble.

    Une version modifiée d'une police ne doit pas porter le nom de l'originale :
    c'est la règle des Reserved Font Name dans la famille des licences de polices,
    et le bon sens — « OpenMoji Color » avec 44 glyphes sur 3 700 tromperait
    n'importe qui inspecterait le fichier. Les noms 1/2/3/4/6/11/16/17 passent
    donc à « Asgard Emoji » ; le droit d'auteur (0), le fabricant (8) et la
    licence (13/14) restent ceux d'OpenMoji.
    """
    from fontTools.ttLib import TTFont
    fam = SPEC["family"]
    ps = "AsgardEmoji-Subset"
    version = "Version %s-asgard-subset-%s" % (SPEC["version"], len(SPEC["glyphs"]))
    wanted = {
        1: fam, 2: ps, 3: "%s;%s" % (ps, version), 4: version,
        6: ps, 11: fam, 16: fam, 17: ps,
    }
    font = TTFont(out)
    nt = font["name"]
    for nid in wanted:
        nt.removeNames(nameID=nid)
        nt.setName(wanted[nid], nid, 3, 1, 0x409)
    font["head"].fontRevision = float(SPEC["version"].split(".")[0]) + 0.0001
    font.save(out)
    check = TTFont(out)["name"]
    got = check.getDebugName(1)
    if got != fam:
        die("renommage non appliqué : la table name 1 porte %r" % (got,))
    return got, check.getDebugName(13) or ""


def main():
    force = "--force" in sys.argv
    codes = [g["cp"] for g in SPEC["glyphs"]]
    if len(set(codes)) != len(codes):
        die("des codepoints sont en double dans emoji-subset.json")
    step("%d glyphes demandés, famille « %s »" % (len(codes), SPEC["family"]))

    ttf = source_ttf(force)
    out_dir = os.path.join(ROOT, "assets", "fonts")
    os.makedirs(out_dir, exist_ok=True)
    tmp_out = os.path.join(CACHE, "asgard-emoji.woff2")
    missing, color = subset(ttf, tmp_out, codes)
    if missing:
        die("amputé à la sous-ensemblure : " + " ".join(missing))
    if not color:
        die("aucune table de couleur dans le résultat : la police serait monochrome")

    # Le nom porté par le binaire doit être celui de la feuille de style, sinon la
    # règle @font-face viserait une famille qui n'existe pas. Avant les copies.
    family_in_font, license_in_font = rename(tmp_out)
    size = os.path.getsize(tmp_out)
    for rel in SPEC["outputs"]:
        dst = os.path.join(ROOT, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(tmp_out, dst)
        step("écrit %s (%.1f Ko)" % (rel, os.path.getsize(dst) / 1024))

    # Attribution : la licence amont l'exige, et le fichier part dans le paquet.
    lines = [
        "Police « %s » — sous-ensemble de OpenMoji" % SPEC["family"],
        "",
        "OpenMoji %s, %s" % (SPEC["version"], SPEC["upstream"]),
        "Licence : %s — %s" % (SPEC["license"], SPEC["licenseUrl"]),
        "Copyright : les contributeurs d'OpenMoji (https://openmoji.org)",
        "",
        "Ce fichier est une œuvre dérivée de OpenMoji : il est distribué sous la",
        "même licence (CC BY-SA 4.0), conformément à la clause de partage dans les",
        "mêmes conditions. L'original complet n'est pas embarqué ; seuls %d glyphes" % len(codes),
        "ont été conservés, pour que les réactions et les smileys d'Asgard restent",
        "lisibles sur un système qui n'installe aucune police émoji (cas de Linux).",
        "",
        "Régénération : python scripts/build-emoji-font.py",
        "Liste des glyphes : scripts/emoji-subset.json",
        "",
        "Glyphes embarqués (U+%s) :" % "  ".join(codes),
    ]
    for g in SPEC["glyphs"]:
        lines.append("  U+%s  %s  (%s)" % (g["cp"], g["ch"], g["why"]))
    with open(os.path.join(out_dir, "LICENSE-OpenMoji.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    meta = json.dumps({
        "familyName": family_in_font,
        "nameID13": license_in_font,
        "glyphs": len(codes),
        "bytes": os.path.getsize(tmp_out),
    }, ensure_ascii=False)
    step("métadonnées : " + meta)
    step("taille finale %.1f Ko | tables couleur %s | %d glyphes vérifiés" % (
        size / 1024, "/".join(color), len(codes)))
    step("OK")


if __name__ == "__main__":
    main()
