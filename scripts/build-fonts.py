"""Build the static Archivo cuts the app bundles.

Google ships Archivo only as a variable font, but React Native on Android
selects a typeface by asset filename and cannot drive a variable axis. So we
freeze the exact instances the Ledger design calls for (docs/design/README.md)
and bundle those.

IBM Plex Mono already has real statics upstream and is downloaded as-is.

    pip install fonttools
    python scripts/build-fonts.py <path-to-Archivo[wdth,wght].ttf>
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = Path("assets/fonts")

# filename -> (weight, width). The design sets headings at width 112 and the
# large numerals at 120; 112.5 is Archivo's named SemiExpanded instance and
# sits between them, so one cut serves both. Unnamed widths are rejected by
# the font's STAT table, which is why we snap to it rather than using 120.
INSTANCES = {
    "Archivo-Regular": (400, 100),
    "Archivo-Medium": (500, 100),
    "Archivo-SemiBold": (600, 100),
    "Archivo-Bold": (700, 100),
    "ArchivoSemiExpanded-SemiBold": (600, 112.5),
    "ArchivoSemiExpanded-Bold": (700, 112.5),
}


def build(source: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (weight, width) in INSTANCES.items():
        font = TTFont(source)
        instance = instancer.instantiateVariableFont(
            font, {"wght": weight, "wdth": width}, inplace=True, updateFontNames=True
        )
        dest = OUT / f"{name}.ttf"
        instance.save(dest)
        print(f"{dest}  wght={weight} wdth={width}  {dest.stat().st_size} bytes")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(Path(sys.argv[1]))
