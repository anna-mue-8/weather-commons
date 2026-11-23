"""Make the web copy of Anna-Lena's Blender model for page A · II.

Run from the sketch folder:
    .venv/Scripts/python scripts/make_web_model.py "3D models/Schwarze Pumpe.glb" models/schwarze-pumpe.glb

What it changes, and why:
- Leaves out the embedded images: the ground texture (Google satellite imagery, which may not be
  redistributed on a public site) and the 'smoke images' picture (source not yet recorded). The ground
  becomes plain dark grey; the 'smoke images' plane is taken out of the scene, because the page draws
  its own clouds (a synthetic simulation).
- Keeps everything else as exported from Blender: the buildings, both cooling towers, the markers at the
  tower tops (Empty, Empty.001) and the Wind and Turbulence objects, whose direction the page uses.

The original .glb is not changed.
"""

import json
import struct
import sys
from pathlib import Path

DROP_NODES = {"smoke images"}
GROUND_MATERIAL = "rastMat.001"
GROUND_COLOUR = [0.02, 0.02, 0.02, 1.0]


def read_glb(path):
    b = Path(path).read_bytes()
    magic, version, _ = struct.unpack("<4sII", b[:12])
    assert magic == b"glTF" and version == 2, "not a glTF 2.0 binary"
    jlen = struct.unpack("<I", b[12:16])[0]
    gltf = json.loads(b[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack("<I", b[off:off + 4])[0]
    return gltf, b[off + 8:off + 8 + blen]


def write_glb(path, gltf, binary):
    j = json.dumps(gltf, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(j) + 8 + len(binary)
    out = struct.pack("<4sII", b"glTF", 2, total)
    out += struct.pack("<I4s", len(j), b"JSON") + j
    out += struct.pack("<I4s", len(binary), b"BIN\0") + binary
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(out)


def main(src, dst):
    gltf, binary = read_glb(src)

    # 1. Take the dropped nodes out of the scene
    names = [n.get("name") for n in gltf["nodes"]]
    for scene in gltf["scenes"]:
        scene["nodes"] = [i for i in scene["nodes"] if names[i] not in DROP_NODES]

    # 2. No images or textures; the ground gets a plain dark colour
    for m in gltf.get("materials", []):
        pbr = m.setdefault("pbrMetallicRoughness", {})
        pbr.pop("baseColorTexture", None)
        for key in ("normalTexture", "emissiveTexture", "occlusionTexture"):
            m.pop(key, None)
        if m.get("name") == GROUND_MATERIAL:
            pbr["baseColorFactor"] = GROUND_COLOUR
    for key in ("images", "textures", "samplers"):
        gltf.pop(key, None)

    # 3. Rebuild the binary with only the data the geometry still uses
    used = sorted({a["bufferView"] for a in gltf["accessors"] if "bufferView" in a})
    remap, chunks, pos = {}, [], 0
    views = []
    for old in used:
        v = dict(gltf["bufferViews"][old])
        start = v.get("byteOffset", 0)
        data = binary[start:start + v["byteLength"]]
        pad = -pos % 4
        chunks.append(b"\0" * pad)
        pos += pad
        v["byteOffset"] = pos
        v["buffer"] = 0
        chunks.append(data)
        pos += len(data)
        remap[old] = len(views)
        views.append(v)
    for a in gltf["accessors"]:
        if "bufferView" in a:
            a["bufferView"] = remap[a["bufferView"]]
    gltf["bufferViews"] = views
    new_bin = b"".join(chunks)
    gltf["buffers"] = [{"byteLength": len(new_bin)}]
    gltf.setdefault("asset", {})["extras"] = {"web_copy": "images removed by scripts/make_web_model.py"}

    write_glb(dst, gltf, new_bin)
    print(f"{dst}: {Path(dst).stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
