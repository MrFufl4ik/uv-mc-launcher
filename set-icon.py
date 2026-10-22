
from pathlib import Path

import lief
from PIL import Image

EXE_PATH = Path("build/uv-mc-launcher.exe")
ICO_PATH = Path("assets/uv-mv-launcher-icon.ico")


def main():
    if not EXE_PATH.is_file():
        raise FileNotFoundError(EXE_PATH)

    if not ICO_PATH.is_file():
        raise FileNotFoundError(ICO_PATH)

    # Read ICO images using Pillow's ICO decoder.
    with Image.open(ICO_PATH) as ico:
        sizes = sorted(ico.info["sizes"], reverse=True)
        images = [
            ico.ico.getimage(size).convert("RGBA")
            for size in sizes
        ]

    if not images:
        raise ValueError(f"No images found in {ICO_PATH}")

    # Parse the Windows executable.
    binary = lief.PE.parse(str(EXE_PATH))
    if binary is None:
        raise RuntimeError(f"Cannot parse PE executable: {EXE_PATH}")

    # Create a Windows icon resource.
    icon = lief.PE.ResourceIcon()
    for image in images:
        icon.add_image(image.width, image.height, image.tobytes())

    # Replace the executable's icon resource.
    binary.resources_manager.add_icon(icon)

    # Rebuild and overwrite the original executable.
    builder = lief.PE.Builder(binary)
    builder.build_resources(True)
    builder.build()
    builder.write(str(EXE_PATH))

    print(f"Icon updated: {EXE_PATH}")


if __name__ == "__main__":
    main()
