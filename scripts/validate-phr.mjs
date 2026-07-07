/* .phr 导出合规校验：使用真实源码模块生成样例档案包，
   验证容器结构、manifest SHA-256 与官方 XSD 符合性。 */
import { execSync } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { exportPhr } from "../src/core/phr-export.js";
import { buildDemoRecords } from "../src/core/demo-data.js";

const subject = { name: "示例用户", genderCode: "2", birthTime: "1974-05-16" };
const records = buildDemoRecords();
const blob = await exportPhr(subject, records);
fs.writeFileSync("sample.phr", Buffer.from(await blob.arrayBuffer()));
console.log(`sample.phr: ${fs.statSync("sample.phr").size} bytes / ${records.length} records`);

// 1. ZIP 完整性与 mimetype 首条目
execSync("unzip -t sample.phr > /dev/null");
const listing = execSync("unzip -lv sample.phr").toString().split("\n");
const mtIdx = listing.findIndex((l) => l.trim().endsWith(" mimetype") || l.trim().endsWith("\tmimetype"));
const anyIdx = listing.findIndex((l) => /manifest\.xml/.test(l));
if (mtIdx < 0 || (anyIdx > 0 && mtIdx > anyIdx)) throw new Error("mimetype 必须是容器首条目");
if (!/Stored/.test(listing[mtIdx])) throw new Error("mimetype 必须以 Stored（不压缩）方式写入");
if (execSync("unzip -p sample.phr mimetype").toString() !== "application/phr+zip") throw new Error("mimetype 内容错误");
console.log("[OK] 容器结构（mimetype 首条目 · Stored · application/phr+zip）");

// 2. 解包
fs.rmSync("_phr_check", { recursive: true, force: true });
fs.mkdirSync("_phr_check");
execSync("unzip -q -o ../sample.phr", { cwd: "_phr_check" });

// 3. manifest SHA-256 与 size 一致性
const mf = fs.readFileSync("_phr_check/manifest.xml", "utf-8");
let n = 0;
for (const m of mf.matchAll(/path="(\/[^"]+)"\s+size="(\d+)"\s+checksum="([0-9a-f]+)"/g)) {
  const data = fs.readFileSync(path.join("_phr_check", m[1].slice(1)));
  if (createHash("sha256").update(data).digest("hex") !== m[3] || data.length !== Number(m[2]))
    throw new Error("manifest 校验不一致: " + m[1]);
  n++;
}
console.log(`[OK] manifest SHA-256（${n} 个条目全部一致）`);

// 4. 官方 XSD 校验
for (const f of ["meta", "subject", "content", "manifest"]) {
  execSync(`xmllint --noout --schema standard/schema/${f}.xsd _phr_check/${f}.xml 2>&1`);
  console.log(`[OK] ${f}.xml 通过官方 XSD 校验`);
}
fs.rmSync("_phr_check", { recursive: true, force: true });
fs.rmSync("sample.phr");
console.log("\n全部合规校验通过 ✔");
