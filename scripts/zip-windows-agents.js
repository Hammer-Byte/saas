import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

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

function buildZip(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, "utf8");
        const data = entry.data;
        const compressed = deflateSync(data, { level: 9 });
        const crc = crc32(data);

        const localHeader = Buffer.concat([
            u32(0x04034b50),
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
    const result = spawnSync("zip", ["-q", "-j", archiveName, ...files], {
        cwd: dir,
        encoding: "utf8",
    });
    return result.status === 0;
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

    if (!zipWithCli(archive.name, archive.files)) {
        const entries = archive.files.map((name) => ({
            name,
            data: readFileSync(join(dir, name)),
        }));
        writeFileSync(archivePath, buildZip(entries));
    }
    console.log(`created ${archive.name}`);
}
