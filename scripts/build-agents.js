/**
 * Builds the HammerByte Agent + service scripts into public/agents.
 *
 *   agents/agent/agent.ps1 (+ VERSION)              -> public/agents/agent/<version>/agent.ps1
 *   agents/services/<id>.ps1 (+ <id>.VERSION)       -> public/agents/<id>/<version>/<id>.ps1
 *   agents/common/hb-common.ps1                     -> inlined between the HB-COMMON markers
 *   public/agents/hammerbyte-agent.zip              -> install-agent.cmd + agent.ps1 + README.txt
 *   public/agents/manifest.build.json               -> every version on disk; registered at server boot
 *
 * A built version is immutable: rebuilding an existing version with different content fails.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "agents");
const OUT = join(ROOT, "public", "agents");
const BASE_URL = String(
    Bun.env.HB_AGENT_BASE_URL || Bun.env.PUBLIC_BASE_URL || "https://hammerbyte.co.in",
).replace(/\/$/, "");

const COMPONENTS = [
    { component: "agent", source: "agent/agent.ps1", versionFile: "agent/VERSION", file: "agent.ps1" },
    { component: "monitor", source: "services/monitor.ps1", versionFile: "services/monitor.VERSION", file: "monitor.ps1" },
    { component: "drivesync", source: "services/drivesync.ps1", versionFile: "services/drivesync.VERSION", file: "drivesync.ps1" },
];

const MARKER_START = "# >>> HB-COMMON";
const MARKER_END = "# <<< HB-COMMON";
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

// Syntax that does not exist in PowerShell 3.0 (Server 2012) or that we deliberately avoid.
const BANNED = [
    [/::new\(/, "::new() needs PowerShell 5"],
    [/^\s*class\s+\w+/m, "classes need PowerShell 5"],
    [/^\s*enum\s+\w+/m, "enums need PowerShell 5"],
    [/^\s*using\s+(namespace|module)\b/m, "using needs PowerShell 5"],
    [/\?\?/, "?? needs PowerShell 7"],
    [/\?\./, "?. needs PowerShell 7"],
    [/\s(&&|\|\|)\s/, "pipeline chain operators need PowerShell 7"],
    [/-Parallel\b/, "ForEach-Object -Parallel needs PowerShell 7"],
    [/\bGet-FileHash\b/, "Get-FileHash needs PowerShell 4"],
    [/\bGet-CimInstance\b/, "use Get-WmiObject (works on every target)"],
    [/\b(ConvertTo|ConvertFrom)-Json\b/, "use ConvertTo-HbJson / ConvertFrom-HbJson"],
    [/\bInvoke-(RestMethod|WebRequest)\b/, "use Invoke-HbHttp / Save-HbFile"],
    [/-AsHashtable\b/, "-AsHashtable needs PowerShell 6"],
];

function fail(message) {
    console.error(`build-agents: ${message}`);
    process.exit(1);
}

function sha256(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

function toCrlf(text) {
    return text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}

function stripStrings(line) {
    return line.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
}

function checkSource(name, text) {
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) > 0x7e && text[i] !== "\t") {
            const line = text.slice(0, i).split("\n").length;
            fail(`${name}: non-ASCII character at line ${line} (PowerShell 5.1 reads BOM-less files as ANSI)`);
        }
    }
    const lines = text.split("\n");
    lines.forEach((line, index) => {
        const code = stripStrings(line.replace(/#.*$/, ""));
        for (const [pattern, reason] of BANNED) {
            if (pattern.test(code)) {
                fail(`${name}:${index + 1}: ${reason}\n    ${line.trim()}`);
            }
        }
    });
}

function readVersion(relative) {
    const version = readFileSync(join(SRC, relative), "utf8").trim();
    if (!VERSION_PATTERN.test(version)) {
        fail(`${relative} must contain a version like 1.2.3 (got "${version}")`);
    }
    return version;
}

function assemble({ source, file }, version, common) {
    const text = readFileSync(join(SRC, source), "utf8").replace(/\r\n/g, "\n");
    const start = text.indexOf(MARKER_START);
    const end = text.indexOf(MARKER_END);
    if (start < 0 || end < start || text.indexOf(MARKER_START, start + 1) >= 0) {
        fail(`${source}: needs exactly one "${MARKER_START}" ... "${MARKER_END}" block`);
    }
    if (text.split("__HB_VERSION__").length !== 2) {
        fail(`${source}: must contain __HB_VERSION__ exactly once`);
    }
    const body =
        text.slice(0, start + MARKER_START.length) +
        "\n" +
        common.trimEnd() +
        "\n" +
        text.slice(end);
    const output = body.replace("__HB_VERSION__", version).replaceAll("__HB_BASE_URL__", BASE_URL);
    if (/__HB_[A-Z_]+__/.test(output)) {
        fail(`${file}: unreplaced placeholder left in output`);
    }
    checkSource(file, output);
    return toCrlf(output);
}

function findPwsh() {
    for (const candidate of [Bun.env.PWSH_PATH, "pwsh", "/tmp/pwsh/pwsh"]) {
        if (!candidate) continue;
        const probe = spawnSync(candidate, ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" });
        if (probe.status === 0) return candidate;
    }
    return null;
}

function parseCheck(pwsh, scratch, paths) {
    const checker = join(scratch, "parse-check.ps1");
    writeFileSync(
        checker,
        `$failed = $false
foreach ($path in $args) {
    $tokens = $null; $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
    foreach ($e in $errors) { Write-Output ("{0}:{1}: {2}" -f $path, $e.Extent.StartLineNumber, $e.Message); $failed = $true }
}
if ($failed) { exit 1 }
`,
    );
    const result = spawnSync(pwsh, ["-NoProfile", "-NonInteractive", "-File", checker, ...paths], {
        encoding: "utf8",
    });
    if (result.status !== 0) {
        fail(`PowerShell parse errors:\n${result.stdout}${result.stderr}`);
    }
}

// ------------------------------------------------------------------ zip (raw DEFLATE, Explorer-safe)

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
}

function buildZip(entries) {
    const { time, day } = dosDateTime(new Date());
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBuffer = Buffer.from(name, "ascii");
        const compressed = deflateRawSync(data, { level: 9 });
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(8, 8);
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(day, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuffer.length, 26);
        local.writeUInt16LE(0, 28);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(day, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(compressed.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuffer.length, 28);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        locals.push(local, nameBuffer, compressed);
        centrals.push(central, nameBuffer);
        offset += local.length + nameBuffer.length + compressed.length;
    }
    const centralBuffer = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuffer.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralBuffer, end]);
}

function verifyZip(zip, entries) {
    let offset = 0;
    for (const { name, data } of entries) {
        if (zip.readUInt32LE(offset) !== 0x04034b50) fail(`zip verify: bad local header for ${name}`);
        const size = zip.readUInt32LE(offset + 18);
        const nameLength = zip.readUInt16LE(offset + 26);
        const extraLength = zip.readUInt16LE(offset + 28);
        const storedName = zip.toString("ascii", offset + 30, offset + 30 + nameLength);
        const start = offset + 30 + nameLength + extraLength;
        const inflated = inflateRawSync(zip.subarray(start, start + size));
        if (storedName !== name || !inflated.equals(data) || crc32(inflated) !== zip.readUInt32LE(offset + 14)) {
            fail(`zip verify: ${name} does not round-trip`);
        }
        offset = start + size;
    }
}

// ------------------------------------------------------------------ main

const common = readFileSync(join(SRC, "common", "hb-common.ps1"), "utf8").replace(/\r\n/g, "\n");
mkdirSync(OUT, { recursive: true });

const assembled = COMPONENTS.map((component) => {
    const version = readVersion(component.versionFile);
    return { component, version, output: Buffer.from(assemble(component, version, common), "ascii") };
});

const pwsh = findPwsh();
if (pwsh) {
    const scratch = mkdtempSync(join(tmpdir(), "hb-agents-"));
    const paths = assembled.map(({ component, output }) => {
        const path = join(scratch, component.file);
        writeFileSync(path, output);
        return path;
    });
    try {
        parseCheck(pwsh, scratch, paths);
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
    console.log("build-agents: PowerShell AST parse OK");
} else {
    console.log("build-agents: pwsh not found; skipped AST parse check (static checks passed)");
}

const built = [];
for (const { component, version, output } of assembled) {
    const dir = join(OUT, component.component, version);
    const target = join(dir, component.file);
    if (existsSync(target)) {
        const existing = readFileSync(target);
        if (!existing.equals(output)) {
            fail(
                `${component.component} ${version} was already built with different content.\n` +
                    `    Bump agents/${component.versionFile} (agents cache scripts by version).`,
            );
        }
    } else {
        mkdirSync(dir, { recursive: true });
        writeFileSync(target, output);
    }
    built.push({ ...component, version, target, data: output });
    console.log(`build-agents: ${component.component} ${version} -> ${target.replace(ROOT + "/", "")}`);
}

// Every version on disk goes into the manifest so older releases stay selectable as "latest".
const artifacts = [];
for (const { component, file } of COMPONENTS) {
    const componentDir = join(OUT, component);
    for (const version of readdirSync(componentDir).filter((name) => VERSION_PATTERN.test(name))) {
        const path = join(componentDir, version, file);
        if (!existsSync(path)) continue;
        const data = readFileSync(path);
        artifacts.push({
            component,
            version,
            file_path: `/public/agents/${component}/${version}/${file}`,
            sha256: sha256(data),
            size_bytes: statSync(path).size,
        });
    }
}
writeFileSync(
    join(OUT, "manifest.build.json"),
    JSON.stringify({ base_url: BASE_URL, artifacts }, null, 2) + "\n",
);

const agent = built.find((item) => item.component === "agent");
const readme = toCrlf(
    readFileSync(join(SRC, "agent", "README.txt"), "utf8").replaceAll("__HB_VERSION__", agent.version),
);
const installCmd = toCrlf(readFileSync(join(SRC, "agent", "install-agent.cmd"), "utf8"));
checkSource("install-agent.cmd", installCmd);
checkSource("README.txt", readme);
const zipEntries = [
    { name: "install-agent.cmd", data: Buffer.from(installCmd, "ascii") },
    { name: "agent.ps1", data: agent.data },
    { name: "README.txt", data: Buffer.from(readme, "ascii") },
];
const zip = buildZip(zipEntries);
verifyZip(zip, zipEntries);
writeFileSync(join(OUT, "hammerbyte-agent.zip"), zip);
console.log(`build-agents: hammerbyte-agent.zip (agent ${agent.version}, ${zip.length} bytes) verified`);
