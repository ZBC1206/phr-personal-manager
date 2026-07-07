import { esc, nowIso } from "./utils.js";
import { tplOf, TPL_CODESYSTEM, TPL_CODESYSTEM_NAME } from "./templates.js";
import { MODEL } from "./parser.js";

/* ---------- .phr 导出：store-only ZIP + SHA-256 manifest ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosDateTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}
function buildZip(entries) {
  const enc = new TextEncoder();
  const dt = dosDateTime(new Date());
  const parts = []; const central = []; let offset = 0;
  for (const e of entries) {
    const nameB = enc.encode(e.name);
    const crc = crc32(e.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, dt.time, true); lh.setUint16(12, dt.date, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, e.data.length, true); lh.setUint32(22, e.data.length, true);
    lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nameB, e.data);
    central.push({ nameB, crc, size: e.data.length, offset });
    offset += 30 + nameB.length + e.data.length;
  }
  const cdStart = offset;
  for (const c of central) {
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
    cd.setUint16(12, dt.time, true); cd.setUint16(14, dt.date, true);
    cd.setUint32(16, c.crc, true); cd.setUint32(20, c.size, true); cd.setUint32(24, c.size, true);
    cd.setUint16(28, c.nameB.length, true);
    cd.setUint32(42, c.offset, true);
    parts.push(new Uint8Array(cd.buffer), c.nameB);
    offset += 46 + c.nameB.length;
  }
  const eo = new DataView(new ArrayBuffer(22));
  eo.setUint32(0, 0x06054b50, true);
  eo.setUint16(8, central.length, true); eo.setUint16(10, central.length, true);
  eo.setUint32(12, offset - cdStart, true); eo.setUint32(16, cdStart, true);
  parts.push(new Uint8Array(eo.buffer));
  return parts;
}
async function sha256Hex(u8) {
  const h = await crypto.subtle.digest("SHA-256", u8);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function dataUrlToBytes(u) {
  const bin = atob(u.split(",")[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

const NS = "https://www.omaha.org.cn/standard/phr/v1.0";
const XH = '<?xml version="1.0" encoding="UTF-8"?>\n';
function buildMetaXml(subject) {
  return XH + `<meta xmlns="${NS}">
  <title>${esc(subject.name)}的个人健康档案</title>
  <creator>${esc(subject.name)}</creator>
  <createTime>${nowIso()}</createTime>
  <formatVersion>1.0</formatVersion>
</meta>`;
}
function buildSubjectXml(subject) {
  return XH + `<subject xmlns="${NS}">
  <personalinfo>
    <name>${esc(subject.name)}</name>` +
    (subject.genderCode ? `\n    <genderCode>${esc(subject.genderCode)}</genderCode>` : "") +
    (subject.birthTime ? `\n    <birthTime>${esc(subject.birthTime)}</birthTime>` : "") + `
  </personalinfo>
</subject>`;
}
function buildContentXml(subject, records) {
  const recXml = records.map((r) => {
    const dir = `/record/${r.recordId}`;
    const hasImg = !!r.image;
    const p = r.processing || {};
    const tp = r.template || tplOf(r.recordType);
    return `    <record>
      <recordId>${esc(r.recordId)}</recordId>
      <recordTitle>${esc(r.recordTitle)}</recordTitle>
      <recordType>${esc(r.recordType)}</recordType>
      <eventTime><eventStart>${esc(r.eventStart)}</eventStart></eventTime>` +
      (r.provider ? `\n      <provider>${esc(r.provider)}</provider>\n      <providerType>医疗服务提供方</providerType>` : "") + `
      <recordCreator>${esc(subject.name)}</recordCreator>
      <recordCreateTime>${esc(r.recordCreateTime || nowIso())}</recordCreateTime>` +
      (r.summary ? `\n      <summary>${esc(r.summary)}</summary>` : "") +
      ((r.tags || []).length ? `\n      <tags>${esc(r.tags.join(","))}</tags>` : "") + `
      <components>
        <component fileName="content.json" fileType="application/json" path="${dir}/content.json" submitter="${esc(subject.name)}" submitterType="个人及监护人" submissionMethod="手动录入">
          <template code="${esc(tp.code)}" codeSystem="${TPL_CODESYSTEM}" codeSystemName="${TPL_CODESYSTEM_NAME}">${esc(tp.name)} v${esc(tp.version)}</template>
          <generationMode>算法推导</generationMode>` +
          (hasImg ? `\n          <sourceRefs><sourceRef refPath="${dir}/attachment/source.jpg"/></sourceRefs>` : "") + `
          <processingInfo>
            <algorithm>${esc(p.algorithm || MODEL)}</algorithm>
            <algorithmVersion>${esc(p.algorithmVersion || "messages-api")}</algorithmVersion>
            <processedTime>${esc(p.processedTime || nowIso())}</processedTime>
            <confidence>${Number(p.confidence ?? 0.5).toFixed(2)}</confidence>
          </processingInfo>
        </component>
      </components>` +
      (hasImg ? `
      <attachments>
        <attachment fileName="source.jpg" fileType="image/jpeg" path="${dir}/attachment/source.jpg" submitter="${esc(subject.name)}" submitterType="个人及监护人" submissionMethod="手动录入"/>
      </attachments>` : "") + `
    </record>`;
  }).join("\n");
  return XH + `<content xmlns="${NS}">
  <contentVersion>1.0</contentVersion>
  <records>
${recXml}
  </records>
</content>`;
}
function buildManifestXml(items) {
  const rows = items.map((f) =>
    `  <fileEntry fileType="${esc(f.mime)}" path="/${esc(f.name)}" size="${f.size}" checksum="${f.sha}" checksumType="SHA-256"/>`
  ).join("\n");
  return XH + `<manifest xmlns="${NS}">\n${rows}\n</manifest>`;
}
async function exportPhr(subject, records) {
  const enc = new TextEncoder();
  const files = []; // 除 mimetype 与 manifest 自身外，全部进 manifest
  files.push({ name: "meta.xml", mime: "text/xml", data: enc.encode(buildMetaXml(subject)) });
  files.push({ name: "subject.xml", mime: "text/xml", data: enc.encode(buildSubjectXml(subject)) });
  files.push({ name: "content.xml", mime: "text/xml", data: enc.encode(buildContentXml(subject, records)) });
  for (const r of records) {
    const detail = {
      recordId: r.recordId, recordTitle: r.recordTitle, recordType: r.recordType,
      eventStart: r.eventStart, provider: r.provider, summary: r.summary, tags: r.tags,
      labs: r.labs, dx: r.dx, rx: r.rx, sx: r.sx, ex: r.ex, processing: r.processing,
    };
    files.push({ name: `record/${r.recordId}/content.json`, mime: "application/json", data: enc.encode(JSON.stringify(detail, null, 2)) });
    if (r.image) files.push({ name: `record/${r.recordId}/attachment/source.jpg`, mime: "image/jpeg", data: dataUrlToBytes(r.image) });
  }
  const manifestItems = [];
  for (const f of files) manifestItems.push({ name: f.name, mime: f.mime, size: f.data.length, sha: await sha256Hex(f.data) });
  const manifest = enc.encode(buildManifestXml(manifestItems));
  const entries = [
    { name: "mimetype", data: enc.encode("application/phr+zip") },
    { name: "manifest.xml", data: manifest },
    ...files.map((f) => ({ name: f.name, data: f.data })),
  ];
  return new Blob(buildZip(entries), { type: "application/phr+zip" });
}

export { exportPhr };
