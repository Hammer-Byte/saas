import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const dir = join(import.meta.dir, "..", "public", "server-monitors");

const archives = [
    {
        name: "hammerbyte-monitor.zip",
        files: [
            "install-monitor.cmd",
            "supervisor.ps1",
            "agent.ps1",
            "README.txt",
            "VERSION.txt",
        ],
    },
    {
        name: "hammerbyte-drive-sync.zip",
        files: [
            "install-drive-sync.cmd",
            "drive-sync.ps1",
            "README.txt",
            "VERSION.txt",
        ],
    },
];

function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            const mask = -(crc & 1);
            crc = (crc >>> 1) ^ (0xedb88320 & mask);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function u16(n) {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n >>> 0, 0);
    return b;
}

function u32(n) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n >>> 0, 0);
    return b;
}

/**
 * Build a PKZIP archive Windows Explorer can open.
 * Must use raw DEFLATE (deflateRaw), NOT zlib-wrapped deflateSync.
 */
function buildZip(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, "utf8");
        const data = entry.data;
        // ZIP method 8 requires raw deflate streams (no zlib header/adler32).
        const compressed = deflateRawSync(data, { level: 9 });
        const crc = crc32(data);

        const localHeader = Buffer.concat([
            u32(0x04034b50),
            u16(20), // version needed
            u16(0), // flags
            u16(8), // deflate
            u16(0), // time
            u16(0), // date
            u32(crc),
            u32(compressed.length),
            u32(data.length),
            u16(nameBuf.length),
            u16(0),
            nameBuf,
            compressed,
        ]);

        const centralHeader = Buffer.concat([
            u32(0x02014b50),
            u16(20),
            u16(20),
            u16(0),
            u16(8),
            u16(0),
            u16(0),
            u32(crc),
            u32(compressed.length),
            u32(data.length),
            u16(nameBuf.length),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(0),
            u32(offset),
            nameBuf,
        ]);

        localParts.push(localHeader);
        centralParts.push(centralHeader);
        offset += localHeader.length;
    }

    const central = Buffer.concat(centralParts);
    const end = Buffer.concat([
        u32(0x06054b50),
        u16(0),
        u16(0),
        u16(entries.length),
        u16(entries.length),
        u32(central.length),
        u32(offset),
        u16(0),
    ]);

    return Buffer.concat([...localParts, central, end]);
}

function zipWithCli(archiveName, files) {
    const result = spawnSync("zip", ["-q", "-j", "-X", archiveName, ...files], {
        cwd: dir,
        encoding: "utf8",
    });
    return result.status === 0;
}

function zipWithPython(archiveName, files) {
    const script = `
import zipfile, sys
from pathlib import Path
out, root, names = sys.argv[1], Path(sys.argv[2]), sys.argv[3:]
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for name in names:
        # ZipInfo with forward-slash names is fine; Windows Explorer accepts them.
        zf.write(root / name, arcname=name)
print("ok")
`;
    const result = spawnSync(
        "python3",
        ["-c", script, join(dir, archiveName), dir, ...files],
        { encoding: "utf8" },
    );
    return result.status === 0;
}

function zipWithSevenZip(archiveName, files) {
    const archivePath = join(dir, archiveName);
    const result = spawnSync(
        "7z",
        ["a", "-tzip", "-mx=9", "-y", archivePath, ...files],
        { cwd: dir, encoding: "utf8" },
    );
    return result.status === 0;
}

function readU16(buf, offset) {
    return buf.readUInt16LE(offset);
}

function readU32(buf, offset) {
    return buf.readUInt32LE(offset);
}

function verifyZipLocal(archivePath, expectedFiles) {
    const buf = readFileSync(archivePath);
    const names = [];
    let offset = 0;
    while (offset + 30 <= buf.length && readU32(buf, offset) === 0x04034b50) {
        const flags = readU16(buf, offset + 6);
        const method = readU16(buf, offset + 8);
        const compSize = readU32(buf, offset + 18);
        const uncompSize = readU32(buf, offset + 22);
        const nameLen = readU16(buf, offset + 26);
        const extraLen = readU16(buf, offset + 28);
        const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
        const dataStart = offset + 30 + nameLen + extraLen;
        const dataEnd = dataStart + compSize;
        if (dataEnd > buf.length) {
            throw new Error(`truncated local entry for ${name}`);
        }
        if (flags & 0x08) {
            throw new Error(`data descriptor bit set for ${name} (bad for Windows Explorer)`);
        }
        const compressed = buf.subarray(dataStart, dataEnd);
        let plain;
        if (method === 0) {
            plain = compressed;
        } else if (method === 8) {
            plain = inflateRawSync(compressed);
        } else {
            throw new Error(`unsupported method ${method} for ${name}`);
        }
        if (plain.length !== uncompSize) {
            throw new Error(`size mismatch for ${name}`);
        }
        if (crc32(plain) !== readU32(buf, offset + 14)) {
            throw new Error(`crc mismatch for ${name}`);
        }
        names.push(name);
        offset = dataEnd;
    }
    const expected = [...expectedFiles].sort();
    const actual = [...names].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        throw new Error(`namelist mismatch ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    }
}

function verifyZip(archivePath, expectedFiles) {
    // Prefer python (matches Windows zlib inflate), else local raw-deflate check.
    const script = `
import zipfile, sys
path = sys.argv[1]
expected = set(sys.argv[2:])
with zipfile.ZipFile(path) as zf:
    names = zf.namelist()
    if set(names) != expected:
        raise SystemExit(f"namelist mismatch {names!r} != {sorted(expected)!r}")
    bad = zf.testzip()
    if bad:
        raise SystemExit(f"corrupt member {bad}")
print("verified")
`;
    const result = spawnSync(
        "python3",
        ["-c", script, archivePath, ...expectedFiles],
        { encoding: "utf8" },
    );
    if (result.status === 0) {
        return;
    }
    try {
        verifyZipLocal(archivePath, expectedFiles);
    } catch (error) {
        throw new Error(
            `ZIP verify failed for ${archivePath}: ${result.stderr || result.stdout || ""} ${error.message}`,
        );
    }
}

for (const archive of archives) {
    const archivePath = join(dir, archive.name);
    if (existsSync(archivePath)) {
        unlinkSync(archivePath);
    }
    for (const file of archive.files) {
        if (!existsSync(join(dir, file))) {
            throw new Error(`Missing ${file} in ${dir}`);
        }
    }

    let method = "";
    if (zipWithCli(archive.name, archive.files)) {
        method = "zip-cli";
    } else if (zipWithPython(archive.name, archive.files)) {
        method = "python";
    } else if (zipWithSevenZip(archive.name, archive.files)) {
        method = "7z";
    } else {
        const entries = archive.files.map((name) => ({
            name,
            data: readFileSync(join(dir, name)),
        }));
        writeFileSync(archivePath, buildZip(entries));
        method = "deflateRaw";
    }

    verifyZip(archivePath, archive.files);
    console.log(`created ${archive.name} via ${method}`);
}
