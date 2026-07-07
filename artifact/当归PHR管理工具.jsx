import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceArea, ResponsiveContainer,
} from "recharts";
import {
  FileText, Upload, Activity, Route, Settings, Search, Check,
  Download, Plus, X, ChevronDown, ChevronUp, Trash2, ArrowRight,
  Users, ThumbsUp, Flag, Bookmark, PenLine,
} from "lucide-react";

/* ============================================================
   当归 · 个人健康档案 MVP
   基于 OMAHA .phr 文件格式规范 v1.0
   模块：M1 智能解析 / M2 病程时间轴 / M3 个人知识图谱 / .phr 导出
   ============================================================ */

/* ---------- 设计令牌 ---------- */
const C = {
  paper: "#F5F6F2",      // 档案纸
  card: "#FFFFFF",
  ink: "#21374D",        // 墨蓝
  inkSoft: "#5A6E80",
  line: "#D8DED4",       // 化验单表格线
  lineSoft: "#E8ECE5",
  seal: "#B3372B",       // 印章红（偏高/异常）
  low: "#2E6E8E",        // 青蓝（偏低）
  tagBg: "#EAEFE8",
  ok: "#4B7A5A",
};
const SERIF = '"Noto Serif SC","Songti SC","SimSun",serif';
const MONO = '"SF Mono","JetBrains Mono","Menlo",monospace';

const RECORD_TYPES = ["门诊记录", "住院记录", "检验报告", "检查报告", "处方单", "体检报告", "其他"];

/* ---------- 双层结构 · 内容模板注册表 ----------
   借鉴 openEHR 双层思想：record 信封层稳定不变，
   临床内容语义由模板（纯数据）承载，解析 prompt、
   核对表单、图谱推导三处均由模板驱动。
   新增/调整单据类型 = 修改此注册表，不改代码。 */
const TPL_CODESYSTEM = "urn:angelica-phr:mvp-templates";
const TPL_CODESYSTEM_NAME = "当归PHR-MVP内容模板集";
const TEMPLATES = {
  "门诊记录": { code: "tpl-outpatient-1.0", name: "门诊记录模板", version: "1.0",
    promptHint: "重点抽取诊断dx、症状sx、处方用药rx；医嘱与处置要点写入summary",
    stage: "门诊诊疗",
    sections: ["dx", "sx", "rx", "ex", "labs"],
    graph: ["dx", "rx", "sx", "labs", "ex", "org"] },
  "住院记录": { code: "tpl-inpatient-1.0", name: "住院记录模板", version: "1.0",
    promptHint: "重点抽取出入院诊断dx、主要治疗手术与检查ex、出院带药rx；date取入院日期，病程要点写入summary",
    stage: "住院/手术",
    sections: ["dx", "rx", "ex", "sx", "labs"],
    graph: ["dx", "rx", "sx", "labs", "ex", "org"] },
  "检验报告": { code: "tpl-lab-report-1.0", name: "检验报告模板", version: "1.0",
    promptHint: "逐行完整抽取labs（名称/结果/单位/参考范围/异常标志），不得遗漏；dx仅在报告明确标注时填写",
    stage: "随访监测",
    sections: ["labs", "dx", "ex", "sx", "rx"],
    graph: ["dx", "rx", "sx", "labs", "ex", "org"] },
  "检查报告": { code: "tpl-exam-report-1.0", name: "检查报告模板", version: "1.0",
    promptHint: "重点抽取检查项目ex，影像/检查所见与结论写入summary；阳性发现对应的诊断填dx",
    stage: "检查评估",
    sections: ["ex", "dx", "sx", "labs", "rx"],
    graph: ["dx", "rx", "sx", "labs", "ex", "org"] },
  "处方单": { code: "tpl-prescription-1.0", name: "处方单模板", version: "1.0",
    promptHint: "重点抽取rx，药名、规格、用法用量完整保留；处方上标注的临床诊断填dx",
    stage: "治疗用药",
    sections: ["rx", "dx", "sx", "ex", "labs"],
    graph: ["dx", "rx", "sx", "labs", "ex", "org"] },
  "体检报告": { code: "tpl-checkup-1.0", name: "体检报告模板", version: "1.0",
    promptHint: "重点抽取各项labs与检查项目ex，总检结论与异常提示写入summary，建议复查项写入tags",
    stage: "健康筛查",
    sections: ["labs", "ex", "dx", "sx", "rx"],
    graph: ["dx", "rx", "sx", "labs", "ex", "org"] },
  "其他": { code: "tpl-generic-1.0", name: "通用记录模板", version: "1.0",
    promptHint: "按通用规则抽取所有可识别字段",
    stage: "记录",
    sections: ["dx", "sx", "rx", "ex", "labs"],
    graph: ["dx", "rx", "sx", "labs", "ex", "org"] },
};
const tplOf = (t) => TEMPLATES[t] || TEMPLATES["其他"];
const GENDERS = [["1", "男"], ["2", "女"], ["0", "未知"], ["9", "未说明"]];

/* ---------- 通用工具 ---------- */
function uuid4() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function nowIso() { return new Date().toISOString().slice(0, 19); }
function normDateTime(s) {
  if (!s) return "";
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t + "T00:00:00";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return t + ":00";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 19);
  return "";
}
function fmtDate(s) { return s ? s.slice(0, 10) : "—"; }
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function numOf(v) {
  const m = String(v ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function rangeOf(r) {
  const m = String(r ?? "").match(/(-?\d+(?:\.\d+)?)\s*[-–~—]\s*(-?\d+(?:\.\d+)?)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}
function splitList(s) { return String(s || "").split(/[,，、;；]/).map((x) => x.trim()).filter(Boolean); }

/* ---------- 本地持久化 ---------- */
async function storGetJson(key) {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
}
async function storSetJson(key, obj) {
  try { return !!(await window.storage.set(key, JSON.stringify(obj))); }
  catch { return false; }
}
async function loadAllRecords() {
  try {
    const res = await window.storage.list("rec:");
    const keys = (res?.keys || []).map((k) => (typeof k === "string" ? k : k?.key)).filter(Boolean);
    const out = [];
    for (const k of keys) { const r = await storGetJson(k); if (r?.recordId) out.push(r); }
    out.sort((a, b) => (b.eventStart || "").localeCompare(a.eventStart || ""));
    return out;
  } catch { return []; }
}

/* ---------- 图片压缩 ---------- */
function compressImage(file, maxDim = 1400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("不是可识别的图片"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- M1 · AI 结构化抽取 ---------- */
const MODEL = "claude-sonnet-4-6";
function buildParsePrompt() {
  const hints = RECORD_TYPES.map((t) => `- ${t}：${tplOf(t).promptHint}`).join("\n");
  return `你是医疗档案结构化引擎。分析这张医疗记录图片，只输出一个JSON对象，不要任何其他文字、解释或markdown围栏。字段如下：
title: 记录标题(如"血常规检验报告");
type: 必须严格取以下之一: 门诊记录|住院记录|检验报告|检查报告|处方单|体检报告|其他;
date: 业务发生时间，格式YYYY-MM-DDTHH:mm:ss，时间不明用T00:00:00，日期不明留空"";
provider: 医疗机构名称，无则"";
summary: 不超过60字的中立摘要;
tags: 字符串数组，不超过4个(如疾病名/检查类别);
conf: 0到1之间的整体识别置信度;
labs: 检验指标数组，每项{n:名称,v:结果值,u:单位,r:参考范围,ab:"↑"或"↓"或""}，最多25项;
dx: 诊断/疾病名数组; rx: 用药数组，每项{n:药名,d:用法用量}; sx: 症状数组; ex: 检查项目名数组。
先判定type，再按该类型内容模板的重点抽取：
${hints}
规则：字段名和结构必须完全一致；识别不清的内容留空或省略，绝不编造图片中不存在的信息；摘要只描述事实，不给任何建议。`;
}

async function parseMedicalImage(dataUrl) {
  const b64 = dataUrl.split(",")[1];
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
          { type: "text", text: buildParsePrompt() },
        ],
      }],
    }),
  });
  const data = await resp.json();
  if (data?.error) throw new Error(data.error.message || "模型调用失败");
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("未能从模型输出中解析出结构化结果");
  const obj = JSON.parse(clean.slice(s, e + 1));
  return {
    title: String(obj.title || "未命名记录"),
    type: RECORD_TYPES.includes(obj.type) ? obj.type : "其他",
    date: normDateTime(obj.date) || "",
    provider: String(obj.provider || ""),
    summary: String(obj.summary || ""),
    tags: Array.isArray(obj.tags) ? obj.tags.map(String).slice(0, 6) : [],
    conf: typeof obj.conf === "number" ? Math.min(1, Math.max(0, obj.conf)) : 0.5,
    labs: (Array.isArray(obj.labs) ? obj.labs : []).map((l) => ({
      n: String(l?.n || ""), v: String(l?.v ?? ""), u: String(l?.u || ""),
      r: String(l?.r || ""), ab: ["↑", "↓"].includes(l?.ab) ? l.ab : "",
    })).filter((l) => l.n),
    dx: (Array.isArray(obj.dx) ? obj.dx : []).map(String).filter(Boolean),
    rx: (Array.isArray(obj.rx) ? obj.rx : []).map((m) => ({ n: String(m?.n || ""), d: String(m?.d || "") })).filter((m) => m.n),
    sx: (Array.isArray(obj.sx) ? obj.sx : []).map(String).filter(Boolean),
    ex: (Array.isArray(obj.ex) ? obj.ex : []).map(String).filter(Boolean),
  };
}

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

/* ---------- 演示数据（虚构患者：两年病程，覆盖七类记录） ---------- */
const DEMO_REC_IDS = ["d0000001-aaaa-4bbb-8ccc-000000000001","d0000002-aaaa-4bbb-8ccc-000000000002","d0000003-aaaa-4bbb-8ccc-000000000003","d0000004-aaaa-4bbb-8ccc-000000000004","d0000005-aaaa-4bbb-8ccc-000000000005","d0000006-aaaa-4bbb-8ccc-000000000006","d0000007-aaaa-4bbb-8ccc-000000000007","d0000008-aaaa-4bbb-8ccc-000000000008"];
const DEMO_KB_IDS = ["demo-kb-1","demo-kb-2","demo-kb-3","demo-kb-4","demo-kb-5","demo-kb-6"];
function buildDemoRecords() {
  const mk = (i, type, eventStart, title, provider, summary, tags, dx, sx, rx, ex, labs, conf) => ({
    recordId: DEMO_REC_IDS[i], recordTitle: title, recordType: type, eventStart, provider, summary, tags,
    recordCreateTime: nowIso(), labs, dx, rx, sx, ex,
    processing: { algorithm: "demo-seed", algorithmVersion: "v0.3", processedTime: nowIso(), confidence: conf },
    template: (({ code, name, version }) => ({ code, name, version }))(tplOf(type)),
    image: null,
  });
  return [
    mk(0, "体检报告", "2024-11-12T09:00:00", "年度健康体检报告", "市健康管理中心",
      "空腹血糖及低密度脂蛋白偏高，血压偏高，建议内分泌科随诊", ["年度体检"], [], [], [],
      ["心电图", "腹部超声"],
      [{ n: "空腹血糖", v: "7.8", u: "mmol/L", r: "3.9-6.1", ab: "↑" },
       { n: "低密度脂蛋白胆固醇", v: "3.9", u: "mmol/L", r: "0-3.4", ab: "↑" },
       { n: "血红蛋白", v: "132", u: "g/L", r: "115-150", ab: "" },
       { n: "谷丙转氨酶", v: "22", u: "U/L", r: "7-40", ab: "" }], 0.93),
    mk(1, "门诊记录", "2024-11-20T10:30:00", "内分泌科初诊", "市第一人民医院",
      "确诊2型糖尿病合并高血压，启动口服降糖及降压治疗，配合生活方式干预", ["初诊"],
      ["2型糖尿病", "高血压"], ["口渴", "多饮", "乏力"],
      [{ n: "二甲双胍缓释片", d: "0.5g 每日两次" }, { n: "苯磺酸氨氯地平片", d: "5mg 每日一次" }],
      ["糖化血红蛋白"],
      [{ n: "糖化血红蛋白", v: "8.2", u: "%", r: "4.0-6.0", ab: "↑" },
       { n: "空腹血糖", v: "8.1", u: "mmol/L", r: "3.9-6.1", ab: "↑" }], 0.9),
    mk(2, "处方单", "2024-12-05T15:00:00", "慢病长期处方续方", "城东社区卫生服务中心",
      "慢病长期处方续方一个月，用药同前", ["续方"], ["2型糖尿病", "高血压"], [],
      [{ n: "二甲双胍缓释片", d: "0.5g 每日两次" }, { n: "苯磺酸氨氯地平片", d: "5mg 每日一次" }],
      [], [], 0.95),
    mk(3, "检验报告", "2025-03-10T08:20:00", "糖尿病随访复查", "市第一人民医院",
      "血糖控制较前改善，继续现方案", ["随访"], ["2型糖尿病"], [], [], [],
      [{ n: "糖化血红蛋白", v: "7.1", u: "%", r: "4.0-6.0", ab: "↑" },
       { n: "空腹血糖", v: "6.8", u: "mmol/L", r: "3.9-6.1", ab: "↑" },
       { n: "低密度脂蛋白胆固醇", v: "3.1", u: "mmol/L", r: "0-3.4", ab: "" }], 0.92),
    mk(4, "检验报告", "2025-06-18T08:10:00", "糖尿病随访复查", "市第一人民医院",
      "血糖接近达标，糖化血红蛋白持续下降", ["随访"], ["2型糖尿病"], [], [], [],
      [{ n: "糖化血红蛋白", v: "6.4", u: "%", r: "4.0-6.0", ab: "↑" },
       { n: "空腹血糖", v: "6.0", u: "mmol/L", r: "3.9-6.1", ab: "" }], 0.91),
    mk(5, "检查报告", "2025-08-02T14:40:00", "腹部超声检查报告", "市第一人民医院",
      "胆囊内多发强回声伴声影，最大约1.2cm，考虑胆囊多发结石", ["超声"],
      ["胆囊结石"], ["右上腹隐痛"], [], ["腹部超声"], [], 0.9),
    mk(6, "住院记录", "2025-09-15T00:00:00", "腹腔镜胆囊切除术住院小结", "市第一人民医院",
      "行腹腔镜胆囊切除术，过程顺利，术后恢复良好出院", ["手术"],
      ["胆囊结石"], [],
      [{ n: "头孢克肟分散片", d: "0.1g 每日两次 × 5天" }],
      ["腹腔镜胆囊切除术", "术前心电图"], [], 0.88),
    mk(7, "检验报告", "2026-04-22T08:30:00", "年度随访复查", "市第一人民医院",
      "各项指标达标，血糖控制良好", ["随访"], ["2型糖尿病"], [], [], [],
      [{ n: "糖化血红蛋白", v: "5.9", u: "%", r: "4.0-6.0", ab: "" },
       { n: "空腹血糖", v: "5.8", u: "mmol/L", r: "3.9-6.1", ab: "" },
       { n: "低密度脂蛋白胆固醇", v: "2.8", u: "mmol/L", r: "0-3.4", ab: "" },
       { n: "血红蛋白", v: "128", u: "g/L", r: "115-150", ab: "" }], 0.94),
  ];
}
function buildDemoKb() {
  const mk = (i, category, diseases, sourceType, sourceRef, alias, title, content, level, reasons, createdAt) => ({
    id: DEMO_KB_IDS[i], category, diseases, title, content, sourceType, sourceRef,
    authorAlias: alias, createdAt, publisher: "demo-seed", demo: true,
    review: { level, reasons: reasons || [] }, helpful: 0, flagCount: 0,
  });
  return [
    mk(0, "指南要点", ["2型糖尿病"], "指南/权威资料", "中国2型糖尿病防治指南（2024年版）", "",
      "糖化血红蛋白的控制目标不是一刀切",
      "指南建议一般成人控制目标为<7.0%；年轻、病程短、无并发症者可更严格至<6.5%；老年、病程长或有低血糖风险者可适当放宽。具体目标应与主诊医生共同确定，不宜互相攀比数值。",
      "ok", [], "2026-05-06T10:00:00"),
    mk(1, "康复经验", ["2型糖尿病"], "患者经验", "", "老周控糖记",
      "餐后散步半小时，三个月糖化降了1个点",
      "确诊后我把晚饭后刷手机改成快走30分钟，主食换成一半糙米，加上按时吃药，三个月复查糖化从8.2降到7.1。每个人情况不同，我的体会是：把运动固定在同一个时段，比「有空就动」容易坚持得多。",
      "ok", [], "2026-05-12T20:30:00"),
    mk(2, "治疗护理", ["胆囊结石"], "患者经验", "", "术后日记",
      "胆囊切除术后一个月的饮食过渡",
      "我的恢复节奏：术后先流食两天，之后一周半流食，两周后逐步恢复普食但坚持少油，油炸和肥肉三个月内没碰。一个月复查时医生说恢复得不错。仅是我的个人经历，术后饮食请以自己的医嘱为准。",
      "ok", [], "2026-05-18T09:10:00"),
    mk(3, "就医经验", ["2型糖尿病"], "患者经验", "", "匿名病友",
      "内分泌科初诊前，把这些材料备齐能省一次挂号",
      "初诊时医生会问近期血糖情况和既往体检结果。我第一次没带体检单，白跑一趟。建议带齐：最近的体检报告、正在吃的药盒或药品清单、家庭自测血糖记录（如有）。",
      "ok", [], "2026-05-25T16:45:00"),
    mk(4, "治疗护理", ["高血压"], "患者经验", "", "河畔晨走",
      "和医生商量把降压药调到睡前吃之后，我的晨起血压更稳了",
      "我原来早上吃氨氯地平，晨起血压总偏高。复诊时医生看了我的动态血压结果，把服药时间调整到睡前，两周后晨起血压平稳了不少。这是医生针对我的情况做的调整，服药时间请务必先咨询自己的医生，不要自行更改。",
      "warn", ["涉及具体用药时间调整，仅为个人经历"], "2026-06-02T21:20:00"),
    mk(5, "指南要点", ["高血压"], "指南/权威资料", "中国高血压防治指南（2024年修订版）", "",
      "家庭自测血压的正确姿势",
      "测前静坐5分钟，背靠椅、双脚落地、袖带与心脏同高；早晚各测2-3次取平均；起床后1小时内、服药前、早餐前的测量更有参考价值。持续记录的趋势比单次数值更重要。",
      "ok", [], "2026-06-10T08:00:00"),
  ];
}
async function seedDemoData() {
  let subj = await storGetJson("subject");
  if (!subj?.name) {
    subj = { name: "示例用户", genderCode: "2", birthTime: "1974-05-16" };
    await storSetJson("subject", subj);
  }
  let recOk = 0, kbOk = 0;
  for (const r of buildDemoRecords()) if (await storSetJson(`rec:${r.recordId}`, r)) recOk++;
  for (const k of buildDemoKb()) if (await storSetJsonShared(`kb:${k.id}`, k)) kbOk++;
  return { recOk, kbOk };
}
async function clearDemoData() {
  for (const id of DEMO_REC_IDS) { try { await window.storage.delete(`rec:${id}`); } catch {} }
  for (const id of DEMO_KB_IDS) { try { await window.storage.delete(`kb:${id}`, true); } catch {} }
}

/* ---------- UI 基元 ---------- */
const inputCls = "w-full px-2.5 py-2 text-sm rounded-sm bg-white";
const inputStyle = { border: `1px solid ${C.line}`, color: C.ink };

function Btn({ variant = "primary", className = "", style = {}, children, ...rest }) {
  const base = "inline-flex items-center gap-1.5 text-sm rounded-sm px-4 py-2 transition-colors disabled:opacity-50";
  const v = variant === "primary"
    ? { background: C.ink, color: "#fff" }
    : variant === "danger"
      ? { border: `1px solid ${C.line}`, color: C.seal, background: C.card }
      : { border: `1px solid ${C.line}`, color: C.inkSoft, background: C.card };
  return <button className={`${base} ${className}`} style={{ ...v, ...style }} {...rest}>{children}</button>;
}
function TypeBadge({ t }) {
  return (
    <span className="inline-block px-2 py-0.5 text-xs border rounded-sm shrink-0"
      style={{ borderColor: C.ink, color: C.ink, fontFamily: SERIF, letterSpacing: "0.08em" }}>
      {t}
    </span>
  );
}
function Tag({ children }) {
  return <span className="inline-block px-2 py-0.5 text-xs rounded-sm mr-1 mb-1" style={{ background: C.tagBg, color: C.inkSoft }}>{children}</span>;
}
function AbMark({ ab }) {
  if (!ab) return null;
  const isUp = ab === "↑";
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 ml-1 text-xs font-bold border rounded-full"
      style={{ color: isUp ? C.seal : C.low, borderColor: isUp ? C.seal : C.low, transform: "rotate(-8deg)" }}
      title={isUp ? "高于参考范围" : "低于参考范围"}>
      {ab}
    </span>
  );
}
function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2">
      <span className="text-sm" style={{ fontFamily: SERIF, color: C.ink, letterSpacing: "0.12em" }}>{children}</span>
      <span className="flex-1" style={{ borderTop: `1px solid ${C.lineSoft}` }} />
    </div>
  );
}
function Field({ label, required, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs mb-1" style={{ color: C.inkSoft }}>
        {label}{required && <span style={{ color: C.seal }}> *</span>}
      </span>
      {children}
    </label>
  );
}
function Empty({ text, actionText, onAction }) {
  return (
    <div className="rounded-sm px-6 py-12 text-center" style={{ border: `1.5px dashed ${C.line}`, background: C.card }}>
      <div className="text-sm mb-4" style={{ color: C.inkSoft }}>{text}</div>
      {actionText && <Btn onClick={onAction}>{actionText}<ArrowRight size={14} /></Btn>}
    </div>
  );
}
function Chip({ active, onClick, children }) {
  return (
    <button className="px-3 py-1.5 text-xs rounded-full transition-colors" onClick={onClick}
      style={active ? { background: C.ink, color: "#fff" } : { border: `1px solid ${C.line}`, color: C.inkSoft, background: C.card }}>
      {children}
    </button>
  );
}
function Spinner() {
  return <span className="inline-block w-5 h-5 rounded-full border-2 animate-spin align-middle"
    style={{ borderColor: C.line, borderTopColor: C.ink }} />;
}
function Seal({ name }) {
  return (
    <div className="w-14 h-14 rounded-full flex flex-col items-center justify-center select-none shrink-0"
      style={{ border: `2px solid ${C.seal}`, color: C.seal, transform: "rotate(-8deg)", fontFamily: SERIF, opacity: 0.85 }}
      aria-hidden="true">
      <span className="text-lg leading-none">{name[0]}</span>
      <span style={{ fontSize: 8, letterSpacing: 3, marginTop: 3, marginRight: -3 }}>健康档案</span>
    </div>
  );
}
function DeleteButton({ onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-sm text-white"
      style={{ background: C.seal }} onClick={onConfirm}>
      <Trash2 size={12} />确认删除？此操作不可恢复
    </button>
  ) : (
    <button className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-sm"
      style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} onClick={() => setArmed(true)}>
      <Trash2 size={12} />删除记录
    </button>
  );
}
function confLevel(c) {
  if (c >= 0.85) return { t: "识别质量：高", color: C.ok, tip: "仍请快速过目一遍关键数字" };
  if (c >= 0.6) return { t: "识别质量：中", color: "#8A6A2F", tip: "建议逐项核对" };
  return { t: "识别质量：低", color: C.seal, tip: "请对照左侧原件仔细核对每一项" };
}

/* ---------- 检验指标表 ---------- */
function LabsTable({ labs }) {
  if (!labs?.length) return null;
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 380 }}>
        <thead>
          <tr style={{ color: C.inkSoft }}>
            {["项目", "结果", "单位", "参考范围", ""].map((h, i) => (
              <th key={i} className="text-left py-1.5 px-2 font-normal text-xs" style={{ borderBottom: `1.5px solid ${C.line}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labs.map((l, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
              <td className="py-1.5 px-2" style={{ color: C.ink }}>{l.n}</td>
              <td className="py-1.5 px-2" style={{ fontFamily: MONO, color: l.ab === "↑" ? C.seal : l.ab === "↓" ? C.low : C.ink, fontWeight: l.ab ? 600 : 400 }}>{l.v}</td>
              <td className="py-1.5 px-2" style={{ color: C.inkSoft }}>{l.u}</td>
              <td className="py-1.5 px-2" style={{ fontFamily: MONO, color: C.inkSoft }}>{l.r}</td>
              <td className="py-1.5 px-2"><AbMark ab={l.ab} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 记录卡片 ---------- */
function RecordCard({ rec, onDelete, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const abn = (rec.labs || []).filter((l) => l.ab).length;
  return (
    <div className="mb-3 rounded-sm transition-colors" style={{ background: C.card, border: `1px solid ${open ? C.ink : C.line}` }}>
      <div role="button" tabIndex={0} className="w-full text-left px-4 py-3 cursor-pointer"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ fontFamily: MONO, color: C.inkSoft }}>{fmtDate(rec.eventStart)}</span>
          <TypeBadge t={rec.recordType} />
          <span className="font-medium flex-1" style={{ color: C.ink, fontFamily: SERIF, fontSize: 15 }}>{rec.recordTitle}</span>
          {abn > 0 && (
            <span className="text-xs px-1.5 py-0.5 border rounded-full shrink-0" style={{ color: C.seal, borderColor: C.seal }}>
              {abn} 项异常
            </span>
          )}
          <span style={{ color: C.inkSoft }}>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
        </div>
        {rec.provider && <div className="text-xs mt-1" style={{ color: C.inkSoft }}>{rec.provider}</div>}
        {rec.summary && <div className="text-sm mt-1" style={{ color: C.inkSoft }}>{rec.summary}</div>}
        {(rec.tags || []).length > 0 && <div className="mt-1.5">{rec.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>}
      </div>
      {open && (
        <div className="px-4 pb-4" style={{ borderTop: `1px dashed ${C.line}` }}>
          {rec.dx?.length > 0 && <div className="text-sm mt-3" style={{ color: C.ink }}><span style={{ color: C.inkSoft }}>诊断：</span>{rec.dx.join("、")}</div>}
          {rec.rx?.length > 0 && (
            <div className="text-sm mt-1" style={{ color: C.ink }}>
              <span style={{ color: C.inkSoft }}>用药：</span>
              {rec.rx.map((m) => m.n + (m.d ? `（${m.d}）` : "")).join("；")}
            </div>
          )}
          {rec.sx?.length > 0 && <div className="text-sm mt-1" style={{ color: C.ink }}><span style={{ color: C.inkSoft }}>症状：</span>{rec.sx.join("、")}</div>}
          {rec.ex?.length > 0 && <div className="text-sm mt-1" style={{ color: C.ink }}><span style={{ color: C.inkSoft }}>检查：</span>{rec.ex.join("、")}</div>}
          <LabsTable labs={rec.labs} />
          {rec.image && <img src={rec.image} alt="原始记录" className="mt-3 rounded-sm max-h-72" style={{ border: `1px solid ${C.line}` }} />}
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <span className="text-xs" style={{ color: C.inkSoft, fontFamily: MONO }}>
              AI 解析 · 置信度 {(rec.processing?.confidence ?? 0.5).toFixed(2)} · {(rec.template || tplOf(rec.recordType)).name} · {rec.recordId.slice(0, 8)}
            </span>
            <DeleteButton onConfirm={() => onDelete(rec.recordId)} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 档案列表（搜索 + 筛选） ---------- */
function RecordsTab({ records, onDelete, goUpload }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const shown = useMemo(() => {
    let r = records;
    if (type) r = r.filter((x) => x.recordType === type);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      r = r.filter((x) =>
        [x.recordTitle, x.provider, x.summary, ...(x.tags || []), ...(x.dx || [])]
          .join(" ").toLowerCase().includes(k));
    }
    return r;
  }, [records, q, type]);

  if (!records.length) {
    return <Empty text="档案还是空的。上传第一张病历或报告的照片，AI 会帮你把它变成结构化记录。"
      actionText="上传第一份病历" onAction={goUpload} />;
  }
  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 px-2.5 rounded-sm bg-white" style={{ border: `1px solid ${C.line}`, minWidth: 200 }}>
          <Search size={14} color={C.inkSoft} />
          <input className="w-full py-2 text-sm bg-transparent" style={{ color: C.ink, border: "none", outline: "inherit" }}
            placeholder="搜索标题、机构、诊断、标签…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button onClick={() => setQ("")} aria-label="清空搜索"><X size={14} color={C.inkSoft} /></button>}
        </div>
        <select className="px-2.5 py-2 text-sm rounded-sm bg-white" style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部类型</option>
          {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      {shown.length
        ? shown.map((r) => <RecordCard key={r.recordId} rec={r} onDelete={onDelete} />)
        : <Empty text="没有匹配的记录。换个关键词，或清空筛选条件再试。" />}
    </div>
  );
}

/* ---------- M1 · 上传解析 ---------- */
function Steps({ current }) {
  const steps = ["选择图片", "AI 解析", "核对入档"];
  return (
    <div className="flex items-center justify-center gap-0 mb-5" aria-label={`第 ${current + 1} 步，共 3 步`}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <span className="w-10 sm:w-16 mx-1" style={{ borderTop: `1.5px solid ${i <= current ? C.ink : C.line}` }} />}
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-xs"
              style={i < current
                ? { background: C.ink, color: "#fff" }
                : i === current
                  ? { border: `1.5px solid ${C.ink}`, color: C.ink, fontWeight: 600 }
                  : { border: `1.5px solid ${C.line}`, color: C.inkSoft }}>
              {i < current ? <Check size={13} /> : i + 1}
            </span>
            <span className="text-xs hidden sm:inline" style={{ color: i === current ? C.ink : C.inkSoft, fontWeight: i === current ? 600 : 400 }}>{s}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function DetailSection({ sec, draft, upd, updLab }) {
  if (sec === "labs") {
    return (
      <div className="mb-3">
        <div className="text-xs mb-1" style={{ color: C.inkSoft }}>检验指标（可修正/增删）</div>
        {draft.labs.length === 0 && <div className="text-xs mb-2" style={{ color: C.inkSoft }}>没有识别到检验指标；如原件上有，可手动添加。</div>}
        {draft.labs.map((l, i) => (
          <div key={i} className="flex gap-1 mb-1 items-center">
            <input className="flex-1 px-2 py-1.5 text-xs rounded-sm" style={inputStyle} value={l.n} placeholder="项目" onChange={(e) => updLab(i, "n", e.target.value)} />
            <input className="w-16 px-2 py-1.5 text-xs rounded-sm" style={{ ...inputStyle, fontFamily: MONO }} value={l.v} placeholder="结果" onChange={(e) => updLab(i, "v", e.target.value)} />
            <input className="w-14 px-2 py-1.5 text-xs rounded-sm" style={inputStyle} value={l.u} placeholder="单位" onChange={(e) => updLab(i, "u", e.target.value)} />
            <input className="w-20 px-2 py-1.5 text-xs rounded-sm" style={{ ...inputStyle, fontFamily: MONO }} value={l.r} placeholder="参考" onChange={(e) => updLab(i, "r", e.target.value)} />
            <select className="w-12 px-1 py-1.5 text-xs rounded-sm" style={inputStyle} value={l.ab} onChange={(e) => updLab(i, "ab", e.target.value)} aria-label="异常方向">
              <option value=""> </option><option value="↑">↑</option><option value="↓">↓</option>
            </select>
            <button className="p-1" style={{ color: C.seal }} aria-label="删除这一行" onClick={() => upd("labs", draft.labs.filter((_, j) => j !== i))}><X size={13} /></button>
          </div>
        ))}
        <button className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-sm mb-2"
          style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}
          onClick={() => upd("labs", [...draft.labs, { n: "", v: "", u: "", r: "", ab: "" }])}>
          <Plus size={12} />添加指标
        </button>
      </div>
    );
  }
  if (sec === "rx") {
    return (
      <Field label="用药（每行一条：药名 | 用法用量）">
        <textarea className={inputCls} style={{ ...inputStyle, fontFamily: MONO }} rows={2} value={draft.rxText} onChange={(e) => upd("rxText", e.target.value)} />
      </Field>
    );
  }
  const label = { dx: "诊断（逗号分隔）", sx: "症状（逗号分隔）", ex: "检查项目（逗号分隔）" }[sec];
  return (
    <Field label={label}>
      <input className={inputCls} style={inputStyle} value={draft[sec].join(",")} onChange={(e) => upd(sec, splitList(e.target.value))} />
    </Field>
  );
}

function UploadTab({ onSaved }) {
  const [stage, setStage] = useState("idle"); // idle | ready | parsing | review
  const [img, setImg] = useState(null);
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState("");
  const [dateErr, setDateErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const pick = async (file) => {
    if (!file) return;
    setErr("");
    try { setImg(await compressImage(file)); setStage("ready"); }
    catch (e) { setErr(e.message); }
  };
  const parse = async () => {
    setStage("parsing"); setErr("");
    try {
      const d = await parseMedicalImage(img);
      setDraft({ ...d, rxText: d.rx.map((m) => `${m.n}${m.d ? " | " + m.d : ""}`).join("\n") });
      setStage("review");
    } catch (e) { setErr("解析没有成功：" + e.message + "。可以点「重新解析」再试一次，或换一张更清晰的照片。"); setStage("ready"); }
  };
  const reset = () => { setStage("idle"); setImg(null); setDraft(null); setErr(""); setDateErr(false); if (fileRef.current) fileRef.current.value = ""; };
  const upd = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const updLab = (i, k, v) => setDraft((p) => { const labs = [...p.labs]; labs[i] = { ...labs[i], [k]: v }; return { ...p, labs }; });
  const save = async () => {
    if (!normDateTime(draft.date)) { setDateErr(true); setErr("请填写业务发生时间，格式如 2026-03-01（这是记录排进时间轴的依据）"); return; }
    setSaving(true); setErr(""); setDateErr(false);
    const tpl = tplOf(draft.type);
    const rec = {
      recordId: uuid4(),
      recordTitle: draft.title || "未命名记录",
      recordType: draft.type,
      eventStart: normDateTime(draft.date),
      provider: draft.provider.trim(),
      summary: draft.summary.trim(),
      tags: draft.tags.filter(Boolean),
      recordCreateTime: nowIso(),
      labs: draft.labs.filter((l) => l.n.trim()),
      dx: draft.dx.filter(Boolean),
      rx: draft.rxText.split("\n").map((s) => s.trim()).filter(Boolean)
        .map((s) => { const [n, d] = s.split("|").map((x) => x.trim()); return { n, d: d || "" }; }),
      sx: draft.sx.filter(Boolean),
      ex: draft.ex.filter(Boolean),
      processing: { algorithm: MODEL, algorithmVersion: "messages-api", processedTime: nowIso(), confidence: draft.conf },
      template: { code: tpl.code, name: tpl.name, version: tpl.version },
      image: img,
    };
    const ok = await storSetJson(`rec:${rec.recordId}`, rec);
    setSaving(false);
    if (!ok) { setErr("保存失败：本地存储不可用或已满。可以删除几条旧记录后重试。"); return; }
    reset();
    onSaved(rec);
  };
  const stepIndex = stage === "idle" ? 0 : stage === "review" ? 2 : 1;
  const lv = draft ? confLevel(draft.conf) : null;
  const tplR = draft ? tplOf(draft.type) : null;

  return (
    <div>
      <Steps current={stepIndex} />
      {err && <div className="mb-3 text-sm px-3 py-2.5 rounded-sm" style={{ color: C.seal, background: "#F7ECEA" }}>{err}</div>}

      {stage === "idle" && (
        <div className="rounded-sm p-10 text-center cursor-pointer transition-colors"
          style={{ border: `1.5px dashed ${dragOver ? C.ink : C.line}`, background: dragOver ? "#EFF3EE" : C.card }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0]); }}>
          <Upload size={28} color={C.inkSoft} className="mx-auto mb-3" />
          <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg mb-1">上传一张病历或报告</div>
          <div className="text-sm mb-5" style={{ color: C.inkSoft }}>拍照或截图都可以：门诊病历、检验/检查报告、处方单、体检报告</div>
          <Btn onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>选择图片</Btn>
          <div className="text-xs mt-3" style={{ color: C.inkSoft }}>也可以把图片拖到这里</div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      {(stage === "ready" || stage === "parsing") && img && (
        <div className="rounded-sm p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="relative">
            <img src={img} alt="待解析的记录照片" className="max-h-80 mx-auto rounded-sm"
              style={{ border: `1px solid ${C.line}`, opacity: stage === "parsing" ? 0.35 : 1 }} />
            {stage === "parsing" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Spinner />
                <div className="text-sm" style={{ color: C.ink, fontWeight: 600 }}>正在识读单据上的文字与指标…</div>
                <div className="text-xs" style={{ color: C.inkSoft }}>通常需要 10–20 秒，请留在本页</div>
              </div>
            )}
          </div>
          {stage === "ready" && (
            <div className="flex gap-2 justify-center mt-4">
              <Btn variant="ghost" onClick={reset}>重新选择</Btn>
              <Btn onClick={parse}>开始 AI 解析<ArrowRight size={14} /></Btn>
            </div>
          )}
        </div>
      )}

      {stage === "review" && draft && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          <div className="lg:col-span-2 lg:sticky lg:top-4 rounded-sm p-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="text-xs mb-2" style={{ color: C.inkSoft }}>原件对照 · 请对着它核对右侧内容</div>
            <img src={img} alt="原始记录" className="w-full rounded-sm" style={{ border: `1px solid ${C.line}` }} />
          </div>

          <div className="lg:col-span-3 rounded-sm p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg">核对解析结果</div>
              <span className="text-xs px-2 py-1 rounded-full" style={{ color: lv.color, border: `1px solid ${lv.color}` }}>
                {lv.t}
              </span>
              <span className="text-xs px-2 py-1 rounded-full" style={{ color: C.inkSoft, border: `1px solid ${C.line}`, fontFamily: SERIF }}>
                {tplR.name} v{tplR.version}
              </span>
            </div>
            <div className="text-xs mb-3" style={{ color: C.inkSoft }}>
              AI 只产出草稿，由你确认后才会入档。{lv.tip}；识别不清的字段已留空。
            </div>

            <SectionLabel>基本信息</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Field label="记录标题"><input className={inputCls} style={inputStyle} value={draft.title} onChange={(e) => upd("title", e.target.value)} /></Field>
              <Field label="记录类型">
                <select className={inputCls} style={inputStyle} value={draft.type} onChange={(e) => upd("type", e.target.value)}>
                  {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="业务发生时间" required>
                <input className={inputCls} style={{ ...inputStyle, fontFamily: MONO, borderColor: dateErr ? C.seal : C.line }}
                  value={draft.date} placeholder="2026-03-01" onChange={(e) => { upd("date", e.target.value); setDateErr(false); }} />
              </Field>
              <Field label="医疗机构"><input className={inputCls} style={inputStyle} value={draft.provider} onChange={(e) => upd("provider", e.target.value)} /></Field>
            </div>
            <Field label="摘要"><textarea className={inputCls} style={inputStyle} rows={2} value={draft.summary} onChange={(e) => upd("summary", e.target.value)} /></Field>

            <SectionLabel>记录明细</SectionLabel>
            <div className="text-xs mb-3" style={{ color: C.inkSoft }}>字段重点与排列由「{tplR.name}」决定；切换上方记录类型，会自动换用对应模板。</div>
            <Field label="标签（逗号分隔）"><input className={inputCls} style={inputStyle} value={draft.tags.join(",")} onChange={(e) => upd("tags", splitList(e.target.value))} /></Field>
            {tplR.sections.map((sec) => (
              <DetailSection key={sec} sec={sec} draft={draft} upd={upd} updLab={updLab} />
            ))}

            <div className="flex gap-2 justify-end mt-4 pt-3" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
              <Btn variant="ghost" onClick={() => setStage("ready")}>返回重新解析</Btn>
              <Btn disabled={saving} onClick={save}><Check size={14} />{saving ? "保存中…" : "确认无误，存入档案"}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- M2 · 病程时间轴 ---------- */
function TrendChart({ records }) {
  const indicators = useMemo(() => {
    const m = new Map();
    for (const r of records) for (const l of r.labs || []) {
      if (numOf(l.v) === null || !r.eventStart) continue;
      m.set(l.n, (m.get(l.n) || 0) + 1);
    }
    return [...m.entries()].filter(([, c]) => c >= 2).map(([n]) => n).sort();
  }, [records]);
  const [sel, setSel] = useState("");
  useEffect(() => { if (indicators.length && !indicators.includes(sel)) setSel(indicators[0]); }, [indicators, sel]);

  const { data, band, unit } = useMemo(() => {
    const pts = []; let band = null; let unit = "";
    for (const r of [...records].sort((a, b) => (a.eventStart || "").localeCompare(b.eventStart || ""))) {
      for (const l of r.labs || []) if (l.n === sel) {
        const v = numOf(l.v);
        if (v === null) continue;
        pts.push({ d: fmtDate(r.eventStart), v, ab: l.ab });
        const rg = rangeOf(l.r); if (rg) band = rg;
        if (l.u) unit = l.u;
      }
    }
    return { data: pts, band, unit };
  }, [records, sel]);

  if (!indicators.length) {
    return (
      <div className="text-sm px-3 py-5 text-center rounded-sm mt-4" style={{ color: C.inkSoft, border: `1.5px dashed ${C.line}`, background: C.card }}>
        同一项检验指标出现两次以上后，这里会自动生成趋势图，帮你看清变化方向。
      </div>
    );
  }
  return (
    <div className="rounded-sm p-4 mt-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span style={{ fontFamily: SERIF, color: C.ink }}>指标趋势</span>
        <select className="px-2.5 py-1.5 text-sm rounded-sm bg-white" style={inputStyle} value={sel} onChange={(e) => setSel(e.target.value)}>
          {indicators.map((n) => <option key={n}>{n}</option>)}
        </select>
        {unit && <span className="text-xs" style={{ color: C.inkSoft, fontFamily: MONO }}>{unit}</span>}
        {band && <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: C.ok, background: "#EDF3EE" }}>参考 {band[0]}–{band[1]}（绿色区间）</span>}
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={C.lineSoft} />
            <XAxis dataKey="d" tick={{ fontSize: 11, fill: C.inkSoft }} />
            <YAxis tick={{ fontSize: 11, fill: C.inkSoft, fontFamily: MONO }} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ fontSize: 12, border: `1px solid ${C.line}` }} formatter={(v) => [v + (unit ? " " + unit : ""), sel]} />
            {band && <ReferenceArea y1={band[0]} y2={band[1]} fill={C.ok} fillOpacity={0.08} />}
            <Line dataKey="v" stroke={C.ink} strokeWidth={1.6}
              dot={({ cx, cy, payload, index }) => (
                <circle key={index} cx={cx} cy={cy} r={3.5}
                  fill={payload.ab === "↑" ? C.seal : payload.ab === "↓" ? C.low : C.ink} />
              )} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs mt-1" style={{ color: C.inkSoft }}>红点为偏高、蓝点为偏低的记录值；数值以你入档时核对的为准。</div>
    </div>
  );
}

function monthsBetween(a, b) { return (b - a) / (1000 * 60 * 60 * 24 * 30.44); }
function TimelineTab({ records, onDelete, goUpload }) {
  const [selId, setSelId] = useState(null);
  const dated = useMemo(
    () => records.filter((r) => r.eventStart).sort((a, b) => a.eventStart.localeCompare(b.eventStart)),
    [records]);
  const lanes = useMemo(() => {
    const m = new Map(); const other = [];
    for (const r of dated) {
      if ((r.dx || []).length) for (const d of r.dx) { if (!m.has(d)) m.set(d, []); m.get(d).push(r); }
      else other.push(r);
    }
    const arr = [...m.entries()];
    if (other.length) arr.push(["未归入病程", other]);
    return arr;
  }, [dated]);

  if (!records.length) return <Empty text="档案里还没有记录。添加第一份病历后，病程会在这里按时间铺开。" actionText="去上传病历" onAction={goUpload} />;
  if (!dated.length) return <Empty text="现有记录缺少业务发生时间，补充时间后才能排进时间轴。" />;

  const t0 = new Date(dated[0].eventStart).getTime();
  const t1 = new Date(dated[dated.length - 1].eventStart).getTime();
  const PXM = 56, PAD = 44;
  const plotW = Math.max(360, Math.round(monthsBetween(t0, t1) * PXM) + PAD * 2);
  const x = (iso) => PAD + monthsBetween(t0, new Date(iso).getTime()) * PXM;
  const ticks = [];
  for (let y = new Date(t0).getFullYear(); y <= new Date(t1).getFullYear() + 1; y++) {
    const px = PAD + monthsBetween(t0, new Date(y, 0, 1).getTime()) * PXM;
    if (px > 8 && px < plotW - 8) ticks.push({ y, px });
  }
  const sel = records.find((r) => r.recordId === selId);
  const undated = records.length - dated.length;
  const dotBase = { border: "2px solid #fff", boxShadow: `0 0 0 1px ${C.line}` };

  return (
    <div>
      <div className="flex rounded-sm" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="shrink-0 w-24 sm:w-28" style={{ borderRight: `1px solid ${C.lineSoft}` }}>
          <div className="h-8 flex items-end px-2 pb-1 text-xs" style={{ color: C.inkSoft }}>病程</div>
          {lanes.map(([d, recs]) => (
            <div key={d} className="h-14 flex flex-col justify-center px-2">
              <span className="text-xs truncate" style={{ fontFamily: SERIF, color: C.ink }}>{d}</span>
              <span className="text-xs" style={{ color: C.inkSoft, fontFamily: MONO }}>{recs.length} 条</span>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto flex-1">
          <div className="relative" style={{ width: plotW }}>
            <div className="h-8 relative" style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
              {ticks.map((tk) => (
                <span key={tk.y} className="absolute text-xs" style={{ left: tk.px + 4, top: 9, color: C.inkSoft, fontFamily: MONO }}>{tk.y}</span>
              ))}
            </div>
            {lanes.map(([d, recs]) => {
              let lastX = -999, flip = false;
              return (
                <div key={d} className="h-14 relative">
                  <div className="absolute left-0 right-0" style={{ top: "50%", borderTop: `1.5px solid ${C.lineSoft}` }} />
                  {ticks.map((tk) => (
                    <span key={tk.y} className="absolute top-0 bottom-0" style={{ left: tk.px, borderLeft: `1px dashed ${C.lineSoft}` }} />
                  ))}
                  {recs.map((r) => {
                    const px = x(r.eventStart);
                    const near = px - lastX < 16;
                    flip = near ? !flip : false;
                    lastX = px;
                    const abn = (r.labs || []).some((l) => l.ab);
                    const hosp = r.recordType === "住院记录";
                    const isSel = selId === r.recordId;
                    return (
                      <button key={r.recordId}
                        title={`${fmtDate(r.eventStart)} · ${r.recordTitle}`}
                        aria-label={`${fmtDate(r.eventStart)} ${r.recordTitle}`}
                        onClick={() => setSelId(isSel ? null : r.recordId)}
                        className={hosp ? "absolute rounded-sm" : "absolute rounded-full"}
                        style={{
                          width: 13, height: 13, left: px - 6.5,
                          top: near && flip ? "28%" : "50%", transform: "translateY(-50%)",
                          background: abn ? C.seal : C.ink,
                          ...dotBase,
                          ...(isSel ? { boxShadow: `0 0 0 2.5px ${C.seal}` } : {}),
                        }} />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs items-center" style={{ color: C.inkSoft }}>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ background: C.ink, ...dotBase }} />常规记录</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ background: C.seal, ...dotBase }} />含异常指标</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: C.ink, ...dotBase }} />住院/手术</span>
        <span>点击标记查看该次记录{undated > 0 ? `（另有 ${undated} 条无时间记录未列入）` : ""}</span>
      </div>
      {sel && <div className="mt-3"><RecordCard key={sel.recordId} rec={sel} onDelete={onDelete} defaultOpen /></div>}
      <TrendChart records={records} />
    </div>
  );
}

/* ---------- M3 · 疾病演进路径 ---------- */
const STAGE_COLORS = { "首次诊断": "#B3372B", "门诊诊疗": "#21374D", "住院/手术": "#6B5B8E", "随访监测": "#2E6E8E", "检查评估": "#7A8B6F", "治疗用药": "#3E5C76", "健康筛查": "#8A8578", "记录": "#8A8578" };
function monthsSince(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (86400000 * 30.44))); }
function KbMini({ item, adopted, onAdopt }) {
  return (
    <div className="rounded-sm px-3 py-2.5 mb-2 flex items-start gap-2" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <KbSourceBadge sourceType={item.sourceType} />
          <span className="text-sm font-medium" style={{ fontFamily: SERIF, color: C.ink }}>{item.title}</span>
        </div>
        <div className="text-xs mt-1" style={{ color: C.inkSoft }}>{(item.content || "").slice(0, 90)}{(item.content || "").length > 90 ? "…" : ""}</div>
        {item.sourceRef && <div className="text-xs mt-0.5" style={{ color: C.ok }}>出处：{item.sourceRef}</div>}
      </div>
      <button className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm"
        style={adopted ? { background: C.ink, color: "#fff" } : { color: C.inkSoft, border: `1px solid ${C.line}` }}
        onClick={onAdopt}>
        <Bookmark size={11} />{adopted ? "已采纳" : "采纳"}
      </button>
    </div>
  );
}
function ProgressionTab({ records, onDelete, showToast, goShare, goUpload }) {
  const diseases = useMemo(() => {
    const first = new Map();
    for (const r of records) for (const d of r.dx || []) {
      const t = r.eventStart || "9999";
      if (!first.has(d) || t < first.get(d)) first.set(d, t);
    }
    return [...first.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([d]) => d);
  }, [records]);
  const [sel, setSel] = useState("");
  useEffect(() => { if (diseases.length && !diseases.includes(sel)) setSel(diseases[0]); }, [diseases, sel]);
  const [openId, setOpenId] = useState(null);
  const [kb, setKb] = useState(null);
  const [adopted, setAdopted] = useState({});
  useEffect(() => {
    (async () => {
      setAdopted((await storGetJson("kb-adopted")) || {});
      setKb(await loadKb());
    })();
  }, []);

  const events = useMemo(() => {
    const evs = records
      .filter((r) => (r.dx || []).includes(sel) || (r.tags || []).includes(sel))
      .filter((r) => r.eventStart)
      .sort((a, b) => a.eventStart.localeCompare(b.eventStart));
    return evs.map((r, i) => ({
      r,
      stage: i === 0 && (r.recordType === "门诊记录" || r.recordType === "住院记录")
        ? "首次诊断" : (tplOf(r.recordType).stage || "记录"),
    }));
  }, [records, sel]);

  const summary = useMemo(() => {
    if (!events.length) return null;
    const lastRxEv = [...events].reverse().find((e) => (e.r.rx || []).length);
    const series = new Map();
    for (const e of events) for (const l of e.r.labs || []) {
      const v = numOf(l.v); if (v === null) continue;
      if (!series.has(l.n)) series.set(l.n, []);
      series.get(l.n).push({ v: l.v, num: v, ab: l.ab, u: l.u });
    }
    const inds = [...series.entries()]
      .filter(([, s]) => s.length >= 2 || s.some((p) => p.ab))
      .map(([n, s]) => ({ n, first: s[0], prev: s.length > 1 ? s[s.length - 2] : null, last: s[s.length - 1] }));
    const lastEvent = events[events.length - 1].r;
    return { lastRxEv, inds, lastEvent, gapMonths: monthsSince(lastEvent.eventStart) };
  }, [events]);

  const related = useMemo(() => {
    if (!kb) return null;
    return kb.filter((i) => (i.diseases || []).includes(sel))
      .sort((a, b) => (a.sourceType === b.sourceType
        ? (b.helpful || 0) - (a.helpful || 0)
        : a.sourceType === "指南/权威资料" ? -1 : 1))
      .slice(0, 4);
  }, [kb, sel]);

  const adoptToggle = async (item) => {
    const na = { ...adopted };
    if (na[item.id]) delete na[item.id];
    else na[item.id] = { title: item.title, category: item.category, diseases: item.diseases };
    setAdopted(na); await storSetJson("kb-adopted", na);
    showToast(na[item.id] ? "已采纳到我的参考" : "已取消采纳");
  };

  if (!diseases.length) return <Empty text="记录里出现诊断后，这里会按疾病梳理出发现、诊疗、随访的演进路径。" actionText="去上传病历" onAction={goUpload} />;
  const arrowDir = (last, prev) => !prev ? "" : last.num > prev.num ? " ↑较上次" : last.num < prev.num ? " ↓较上次" : " 与上次持平";

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {diseases.map((d) => <Chip key={d} active={sel === d} onClick={() => { setSel(d); setOpenId(null); }}>{d}</Chip>)}
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex items-stretch" style={{ minWidth: "min-content" }}>
          {events.map((e, i) => {
            const abn = (e.r.labs || []).filter((l) => l.ab).length;
            const active = openId === e.r.recordId;
            return (
              <React.Fragment key={e.r.recordId}>
                {i > 0 && <div className="flex items-center px-0.5 shrink-0"><ArrowRight size={14} color={C.inkSoft} /></div>}
                <button onClick={() => setOpenId(active ? null : e.r.recordId)}
                  className="text-left rounded-sm px-3 py-2.5 w-40 shrink-0 transition-colors"
                  style={{ background: C.card, border: `1.5px solid ${active ? (STAGE_COLORS[e.stage] || C.ink) : C.line}` }}>
                  <span className="inline-block text-xs px-1.5 py-0.5 rounded-sm mb-1 text-white" style={{ background: STAGE_COLORS[e.stage] || C.ink }}>{e.stage}</span>
                  <div className="text-xs" style={{ fontFamily: MONO, color: C.inkSoft }}>{fmtDate(e.r.eventStart)}</div>
                  <div className="text-xs mt-0.5 leading-snug" style={{ color: C.ink }}>{e.r.recordTitle}</div>
                  {abn > 0 && <div className="text-xs mt-0.5" style={{ color: C.seal }}>{abn} 项指标异常</div>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      {openId && (() => {
        const r = records.find((x) => x.recordId === openId);
        return r ? <div className="mt-2"><RecordCard key={r.recordId} rec={r} onDelete={onDelete} defaultOpen /></div> : null;
      })()}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="rounded-sm px-3 py-2.5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="text-xs mb-1" style={{ color: C.inkSoft }}>在用方案（档案最近一次）</div>
            {summary.lastRxEv ? (
              <>
                {summary.lastRxEv.r.rx.map((m, i) => <div key={i} className="text-sm" style={{ color: C.ink }}>{m.n}{m.d ? <span className="text-xs" style={{ color: C.inkSoft }}>（{m.d}）</span> : null}</div>)}
                <div className="text-xs mt-1" style={{ fontFamily: MONO, color: C.inkSoft }}>{fmtDate(summary.lastRxEv.r.eventStart)}</div>
              </>
            ) : <div className="text-sm" style={{ color: C.inkSoft }}>档案中暂无用药记录</div>}
          </div>
          <div className="rounded-sm px-3 py-2.5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="text-xs mb-1" style={{ color: C.inkSoft }}>关键指标（最近值）</div>
            {summary.inds.length ? summary.inds.slice(0, 3).map((it) => (
              <div key={it.n} className="text-sm" style={{ color: C.ink }}>
                {it.n} <span style={{ fontFamily: MONO, fontWeight: 600, color: it.last.ab === "↑" ? C.seal : it.last.ab === "↓" ? C.low : C.ok }}>{it.last.v}{it.last.u}</span>
                <span className="text-xs" style={{ color: C.inkSoft }}>{arrowDir(it.last, it.prev)}</span>
              </div>
            )) : <div className="text-sm" style={{ color: C.inkSoft }}>暂无可比对的指标</div>}
          </div>
          <div className="rounded-sm px-3 py-2.5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="text-xs mb-1" style={{ color: C.inkSoft }}>随访节奏</div>
            <div className="text-sm" style={{ color: C.ink }}>最近记录 {fmtDate(summary.lastEvent.eventStart)}</div>
            <div className="text-sm" style={{ color: summary.gapMonths >= 6 ? C.seal : C.ink }}>距今约 {summary.gapMonths} 个月</div>
          </div>
        </div>
      )}

      {summary && (
        <div className="rounded-sm px-4 py-3 mt-3" style={{ background: "#EFF3EE" }}>
          <div className="text-xs font-medium mb-1.5" style={{ color: C.ink }}>把档案变成可沟通的信息（就诊时可参考，非医疗建议）</div>
          {summary.inds.slice(0, 3).map((it) => (
            <div key={it.n} className="text-xs mb-0.5" style={{ color: C.inkSoft }}>
              {it.n}：首次 {it.first.v}{it.first.u} → 最近 {it.last.v}{it.last.u}{it.last.ab ? `（仍${it.last.ab === "↑" ? "偏高" : "偏低"}）` : "（在参考范围内）"}
            </div>
          ))}
          {summary.gapMonths >= 6 && <div className="text-xs mb-0.5" style={{ color: C.inkSoft }}>距最近一条相关记录已超过半年，可核对与医生约定的随访安排。</div>}
          <div className="text-xs" style={{ color: C.inkSoft }}>复诊时可携带上面的在用方案与指标变化，帮助医生快速了解病程。</div>
        </div>
      )}

      <SectionLabel>病友与指南参考</SectionLabel>
      {related === null ? (
        <div className="text-sm py-4 text-center" style={{ color: C.inkSoft }}><Spinner /> <span className="ml-2">正在匹配相关分享…</span></div>
      ) : related.length ? (
        <>
          {related.map((i) => <KbMini key={i.id} item={i} adopted={!!adopted[i.id]} onAdopt={() => adoptToggle(i)} />)}
          <button className="text-xs underline mt-1" style={{ color: C.inkSoft }} onClick={() => goShare(sel)}>查看更多「{sel}」相关分享 →</button>
        </>
      ) : (
        <div className="text-xs py-3" style={{ color: C.inkSoft }}>
          还没有与「{sel}」相关的分享。<button className="underline" onClick={() => goShare(sel)}>去分享区看看，或发第一条</button>
        </div>
      )}
    </div>
  );
}

/* ---------- 设置与导出 ---------- */
function SettingsTab({ subject, setSubject, records, showToast, onDemoChange }) {
  const [form, setForm] = useState(subject || { name: "", genderCode: "", birthTime: "" });
  const [msg, setMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const [dl, setDl] = useState(null);
  const [demoBusy, setDemoBusy] = useState(false);
  useEffect(() => { setForm(subject || { name: "", genderCode: "", birthTime: "" }); }, [subject]);

  const save = async () => {
    if (!form.name.trim()) { setMsg("姓名为必填项（档案主体的最低要求）"); return; }
    const s = { name: form.name.trim(), genderCode: form.genderCode, birthTime: form.birthTime };
    const ok = await storSetJson("subject", s);
    setSubject(s);
    setMsg("");
    if (ok) showToast("已保存主体信息"); else setMsg("保存失败，本地存储不可用");
  };
  const doExport = async () => {
    setExporting(true); setMsg(""); setDl(null);
    try {
      const blob = await exportPhr(subject, records);
      const url = URL.createObjectURL(blob);
      setDl({ url, size: (blob.size / 1024).toFixed(0), name: `${subject.name}-健康档案-${nowIso().slice(0, 10)}.phr` });
      showToast("档案包已生成，点击链接下载");
    } catch (e) { setMsg("导出失败：" + e.message); }
    setExporting(false);
  };

  return (
    <div>
      <div className="rounded-sm p-4 mb-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg mb-1">档案主体</div>
        <div className="text-xs mb-4" style={{ color: C.inkSoft }}>遵循数据最小化：只需要姓名，性别与出生日期可选，不收集证件号等敏感信息。</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
          <Field label="姓名" required><input className={inputCls} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="性别">
            <select className={inputCls} style={inputStyle} value={form.genderCode} onChange={(e) => setForm({ ...form, genderCode: e.target.value })}>
              <option value="">未填写</option>
              {GENDERS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </Field>
          <Field label="出生日期"><input type="date" className={inputCls} style={inputStyle} value={form.birthTime} onChange={(e) => setForm({ ...form, birthTime: e.target.value })} /></Field>
        </div>
        <Btn onClick={save}><Check size={14} />保存主体信息</Btn>
      </div>

      <div className="rounded-sm p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg mb-1">导出 .phr 档案包</div>
        <div className="text-xs mb-3" style={{ color: C.inkSoft }}>
          基于 OMAHA《"当归"个人健康档案文件格式规范》v1.0 生成 .phr 容器文件（含本工具定义的内容模板等实现层扩展），包含全部记录、结构化内容与原始图片，AI 解析过程按规范写入溯源信息。这个文件属于你，可长期保存，也可交给任何符合规范的软件打开。数字签名与包级加密不在本工具范围内。
        </div>
        <Btn disabled={!subject?.name || !records.length || exporting} onClick={doExport}>
          <Download size={14} />{exporting ? "打包中…" : `导出 ${records.length} 条记录`}
        </Btn>
        {!subject?.name && <div className="text-xs mt-2" style={{ color: C.seal }}>请先在上方保存主体姓名</div>}
        {subject?.name && !records.length && <div className="text-xs mt-2" style={{ color: C.inkSoft }}>档案里还没有记录</div>}
        {dl && (
          <div className="mt-3 text-sm px-3 py-2.5 rounded-sm inline-flex items-center gap-2" style={{ background: "#EDF3EE" }}>
            <Download size={14} color={C.ok} />
            <a href={dl.url} download={dl.name} className="underline" style={{ color: C.ink }}>下载 {dl.name}</a>
            <span className="text-xs" style={{ color: C.inkSoft, fontFamily: MONO }}>{dl.size} KB</span>
          </div>
        )}
      </div>
      <div className="rounded-sm p-4 mt-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg mb-1">演示数据</div>
        <div className="text-xs mb-3" style={{ color: C.inkSoft }}>
          载入一位虚构患者两年的病程样本：2型糖尿病与高血压的长期管理、一次胆囊结石手术，覆盖全部七类记录与六条病友分享示例，用于体验时间轴、指标趋势、知识图谱与分享区。演示记录按固定编号存取，可随时一键清除，不影响你自己的真实记录。
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn disabled={demoBusy} onClick={async () => {
            setDemoBusy(true);
            try {
              const res = await seedDemoData();
              if (!res.recOk) { showToast("载入失败：本地存储不可用，请在 claude.ai 的 Artifact 预览中打开后重试"); return; }
              showToast(res.kbOk
                ? `已载入 ${res.recOk} 条演示记录与 ${res.kbOk} 条分享示例`
                : `已载入 ${res.recOk} 条演示记录（共享存储暂不可用，分享示例未写入）`);
              onDemoChange("timeline");
            } catch (e) { showToast("载入失败：" + (e?.message || "未知错误")); }
            finally { setDemoBusy(false); }
          }}>{demoBusy ? "处理中…" : "载入演示数据"}</Btn>
          <Btn variant="danger" disabled={demoBusy} onClick={async () => {
            setDemoBusy(true);
            try { await clearDemoData(); showToast("演示数据已清除"); onDemoChange(); }
            catch (e) { showToast("清除失败：" + (e?.message || "未知错误")); }
            finally { setDemoBusy(false); }
          }}>清除演示数据</Btn>
        </div>
      </div>
      {msg && <div className="mt-3 text-sm" style={{ color: C.seal }}>{msg}</div>}
    </div>
  );
}

/* ---------- 首次引导 ---------- */
function Welcome({ setSubject, goUpload, showToast }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const create = async () => {
    if (!name.trim()) { setErr("请先填写姓名"); return; }
    const s = { name: name.trim(), genderCode: "", birthTime: "" };
    await storSetJson("subject", s);
    setSubject(s);
    showToast(`已为${s.name}建立档案`);
  };
  return (
    <div className="rounded-sm p-8 sm:p-10 text-center" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div style={{ fontFamily: SERIF, color: C.ink, letterSpacing: "0.04em" }} className="text-xl mb-2">
        把散落的病历，收进一份属于自己的档案
      </div>
      <div className="text-sm mb-6 max-w-md mx-auto" style={{ color: C.inkSoft }}>
        拍下病历或报告，AI 帮你整理成结构化记录；病程按时间铺开，指标变化一眼可见。数据只存在你自己的设备上。
      </div>
      <div className="flex gap-2 justify-center items-center flex-wrap">
        <input className="px-3 py-2 text-sm rounded-sm bg-white w-44" style={{ ...inputStyle, borderColor: err ? C.seal : C.line }}
          placeholder="你的姓名" value={name}
          onChange={(e) => { setName(e.target.value); setErr(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
        <Btn onClick={create}>建立我的档案<ArrowRight size={14} /></Btn>
      </div>
      {err && <div className="text-xs mt-2" style={{ color: C.seal }}>{err}</div>}
      <div className="text-xs mt-5" style={{ color: C.inkSoft }}>建档只需要姓名，不收集证件号等敏感信息</div>
    </div>
  );
}

/* ---------- M4 · 病友知识分享 ---------- */
const KB_CATS = ["就医经验", "康复经验", "治疗护理", "指南要点"];
async function storSetJsonShared(key, obj) {
  try { return !!(await window.storage.set(key, JSON.stringify(obj), true)); }
  catch { return false; }
}
async function getAnonId() {
  try { const r = await window.storage.get("anonid"); if (r?.value) return r.value; } catch {}
  const id = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
  try { await window.storage.set("anonid", id); } catch {}
  return id;
}
async function loadKb() {
  try {
    const res = await window.storage.list("kb:", true);
    const keys = (res?.keys || []).map((k) => (typeof k === "string" ? k : k?.key)).filter(Boolean);
    const items = [];
    for (const k of keys) {
      try { const r = await window.storage.get(k, true); const o = JSON.parse(r.value); if (o?.id && o?.title) items.push(o); } catch {}
    }
    const votes = {}, flags = {};
    try {
      const v = await window.storage.list("kbv:", true);
      for (const k of (v?.keys || []).map((x) => (typeof x === "string" ? x : x?.key)).filter(Boolean)) {
        const id = k.split(":")[1]; if (id) votes[id] = (votes[id] || 0) + 1;
      }
    } catch {}
    try {
      const f = await window.storage.list("kbf:", true);
      for (const k of (f?.keys || []).map((x) => (typeof x === "string" ? x : x?.key)).filter(Boolean)) {
        const id = k.split(":")[1]; if (id) flags[id] = (flags[id] || 0) + 1;
      }
    } catch {}
    items.forEach((i) => { i.helpful = votes[i.id] || 0; i.flagCount = flags[i.id] || 0; });
    return items.filter((i) => i.flagCount < 3)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  } catch { return []; }
}
const KB_SCREEN_PROMPT = `你是患者互助社区的内容安全审核员。审核下面这条病友分享，只输出一个JSON对象，不要任何其他文字：{"level":"ok"或"warn"或"block","reasons":["简短中文原因"],"suggest":"一句修改建议"}。
判定 block（拦截）的情形：鼓动停止或替代正规治疗；给出具体药物剂量、用药方案等指令性医疗建议；宣传以偏方替代手术放化疗；包含他人可识别隐私（电话、证件号、完整住址）；辱骂攻击特定个人；广告、引流、售卖。
判定 warn（放行但提示）的情形：个人经验涉及具体治疗细节但仅陈述自身经历、未鼓动他人照做；对医院或医生的主观负面评价。
判定 ok：一般性康复经验、护理注意事项、就医流程与科室信息、指南内容的客观转述。
block 时 suggest 必填，说明如何修改后可以发布。`;
async function screenKb(f) {
  const payload = `分类：${f.category}\n相关疾病：${(f.diseases || []).join("、") || "未填"}\n来源：${f.sourceType}${f.sourceRef ? "（" + f.sourceRef + "）" : ""}\n标题：${f.title}\n正文：${f.content}`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1000,
      messages: [{ role: "user", content: KB_SCREEN_PROMPT + "\n---\n" + payload }],
    }),
  });
  const data = await resp.json();
  if (data?.error) throw new Error(data.error.message || "审核服务调用失败");
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("审核结果解析失败");
  const o = JSON.parse(clean.slice(s, e + 1));
  return {
    level: ["ok", "warn", "block"].includes(o.level) ? o.level : "warn",
    reasons: Array.isArray(o.reasons) ? o.reasons.map(String) : [],
    suggest: String(o.suggest || ""),
  };
}
function KbSourceBadge({ sourceType }) {
  const isGuide = sourceType === "指南/权威资料";
  return (
    <span className="inline-block px-2 py-0.5 text-xs border rounded-sm shrink-0"
      style={{ borderColor: isGuide ? C.ok : C.ink, color: isGuide ? C.ok : C.ink, fontFamily: SERIF, letterSpacing: "0.06em" }}>
      {isGuide ? "指南·权威资料" : "患者经验"}
    </span>
  );
}
function FlagButton({ onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm text-white" style={{ background: C.seal }}
      onClick={() => { onConfirm(); setArmed(false); }}>
      <Flag size={11} />确认举报？
    </button>
  ) : (
    <button className="inline-flex items-center gap-1 text-xs px-2 py-1" style={{ color: C.inkSoft }} onClick={() => setArmed(true)}>
      <Flag size={11} />举报
    </button>
  );
}
function KbCard({ item, voted, adopted, onVote, onAdopt, onFlag }) {
  const [expand, setExpand] = useState(false);
  const long = (item.content || "").length > 130;
  const body = expand || !long ? item.content : item.content.slice(0, 130) + "…";
  return (
    <div className="mb-3 rounded-sm px-4 py-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <KbSourceBadge sourceType={item.sourceType} />
        <span className="text-xs px-2 py-0.5 rounded-sm" style={{ background: C.tagBg, color: C.inkSoft }}>{item.category}</span>
        {(item.diseases || []).map((d) => <Tag key={d}>{d}</Tag>)}
      </div>
      <div className="mt-2 font-medium" style={{ fontFamily: SERIF, color: C.ink, fontSize: 15 }}>{item.title}</div>
      {item.sourceRef && <div className="text-xs mt-0.5" style={{ color: C.ok }}>出处：{item.sourceRef}</div>}
      <div className="text-sm mt-1.5 whitespace-pre-wrap" style={{ color: C.inkSoft, lineHeight: 1.7 }}>{body}</div>
      {long && (
        <button className="text-xs mt-1 underline" style={{ color: C.inkSoft }} onClick={() => setExpand(!expand)}>
          {expand ? "收起" : "展开全文"}
        </button>
      )}
      {item.review?.level === "warn" && (
        <div className="text-xs mt-2 px-2.5 py-1.5 rounded-sm" style={{ background: "#FBF3E4", color: "#8A6A2F" }}>
          内容涉及个人治疗细节，仅代表分享者自身经历，请勿自行照做，重要决策请与主治医生确认。
        </div>
      )}
      {item.sourceType === "患者经验" && item.review?.level !== "warn" && (
        <div className="text-xs mt-2" style={{ color: C.inkSoft }}>个人经验分享，不构成医疗建议。</div>
      )}
      <div className="flex items-center gap-3 mt-2.5 pt-2 flex-wrap" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
        <span className="text-xs" style={{ color: C.inkSoft, fontFamily: MONO }}>{item.authorAlias || "匿名病友"} · {fmtDate(item.createdAt)}</span>
        <span className="flex-1" />
        <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm"
          style={voted ? { color: C.ok } : { color: C.inkSoft, border: `1px solid ${C.line}` }}
          disabled={voted} onClick={onVote}>
          <ThumbsUp size={11} />{voted ? "已觉得有用" : "有用"} {item.helpful > 0 ? item.helpful : ""}
        </button>
        <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm"
          style={adopted ? { background: C.ink, color: "#fff" } : { color: C.inkSoft, border: `1px solid ${C.line}` }}
          onClick={onAdopt}>
          <Bookmark size={11} />{adopted ? "已采纳" : "采纳"}
        </button>
        <FlagButton onConfirm={onFlag} />
      </div>
    </div>
  );
}
function KbPublish({ myDx, uid, onPublished, onCancel, showToast }) {
  const [form, setForm] = useState({
    category: KB_CATS[0], diseases: [], title: "", content: "",
    sourceType: "患者经验", sourceRef: "", alias: "",
  });
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [blockInfo, setBlockInfo] = useState(null);
  const upd = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErr(""); setBlockInfo(null); };

  const submit = async () => {
    if (!form.title.trim()) { setErr("请填写标题"); return; }
    if (form.content.trim().length < 20) { setErr("正文太短了，写清楚一点更能帮到病友（至少 20 字）"); return; }
    if (form.content.length > 1000) { setErr("正文请控制在 1000 字以内"); return; }
    if (form.sourceType === "指南/权威资料" && !form.sourceRef.trim()) { setErr("引用指南或权威资料时，必须注明出处"); return; }
    if (!agree) { setErr("请先勾选发布确认"); return; }
    setSubmitting(true); setErr(""); setBlockInfo(null);
    let review;
    try { review = await screenKb(form); }
    catch (e) { setErr("内容审核暂不可用：" + e.message + "。稍后再试。"); setSubmitting(false); return; }
    if (review.level === "block") { setBlockInfo(review); setSubmitting(false); return; }
    const item = {
      id: uuid4(), category: form.category, diseases: form.diseases,
      title: form.title.trim(), content: form.content.trim(),
      sourceType: form.sourceType, sourceRef: form.sourceRef.trim(),
      authorAlias: form.alias.trim() || "匿名病友", createdAt: nowIso(),
      publisher: uid, review: { level: review.level, reasons: review.reasons },
      helpful: 0, flagCount: 0,
    };
    const ok = await storSetJsonShared(`kb:${item.id}`, item);
    setSubmitting(false);
    if (!ok) { setErr("发布失败：共享存储暂不可用，请稍后重试"); return; }
    showToast(review.level === "warn" ? "已发布（带谨慎参考提示）" : "已发布，谢谢你的分享");
    onPublished(item);
  };

  return (
    <div className="rounded-sm p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg mb-1">分享一条经验</div>
      <div className="text-xs mb-4" style={{ color: C.inkSoft }}>
        你的经验可能正是另一位病友需要的。发布前会经过 AI 安全审核；请不要写入自己或他人的真实姓名、电话等隐私信息。
      </div>
      {err && <div className="mb-3 text-sm px-3 py-2.5 rounded-sm" style={{ color: C.seal, background: "#F7ECEA" }}>{err}</div>}
      {blockInfo && (
        <div className="mb-3 text-sm px-3 py-2.5 rounded-sm" style={{ background: "#F7ECEA" }}>
          <div style={{ color: C.seal, fontWeight: 600 }}>这条内容未通过安全审核，暂不能发布</div>
          {blockInfo.reasons.map((r, i) => <div key={i} className="text-xs mt-1" style={{ color: C.seal }}>· {r}</div>)}
          {blockInfo.suggest && <div className="text-xs mt-2" style={{ color: C.inkSoft }}>修改建议:{blockInfo.suggest}</div>}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Field label="分类">
          <select className={inputCls} style={inputStyle} value={form.category} onChange={(e) => upd("category", e.target.value)}>
            {KB_CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="相关疾病（逗号分隔）">
          <input className={inputCls} style={inputStyle} value={form.diseases.join(",")}
            placeholder={myDx.length ? `如：${myDx[0]}` : "如：高血压"}
            onChange={(e) => upd("diseases", splitList(e.target.value))} />
        </Field>
        <Field label="内容来源">
          <select className={inputCls} style={inputStyle} value={form.sourceType} onChange={(e) => upd("sourceType", e.target.value)}>
            <option>患者经验</option>
            <option>指南/权威资料</option>
          </select>
        </Field>
        {form.sourceType === "指南/权威资料" ? (
          <Field label="出处" required>
            <input className={inputCls} style={inputStyle} value={form.sourceRef} placeholder="如：中国高血压防治指南(2024)" onChange={(e) => upd("sourceRef", e.target.value)} />
          </Field>
        ) : (
          <Field label="署名（可留空，默认匿名病友）">
            <input className={inputCls} style={inputStyle} value={form.alias} placeholder="昵称即可，请勿用真名" onChange={(e) => upd("alias", e.target.value)} />
          </Field>
        )}
      </div>
      <Field label="标题" required>
        <input className={inputCls} style={inputStyle} value={form.title} placeholder="一句话说清这条经验是关于什么的" onChange={(e) => upd("title", e.target.value)} />
      </Field>
      <Field label={`正文（${form.content.length}/1000）`} required>
        <textarea className={inputCls} style={inputStyle} rows={6} value={form.content}
          placeholder="写下具体的经过和你的做法。例如：就诊科室与流程、康复训练的安排、放化疗期间的饮食与护理注意点…"
          onChange={(e) => upd("content", e.target.value)} />
      </Field>
      <label className="flex items-start gap-2 text-xs mb-4 cursor-pointer" style={{ color: C.inkSoft }}>
        <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr(""); }} />
        <span>我确认内容不含真实姓名、电话、证件号等隐私信息；我了解发布后本工具的所有使用者都能看到这条内容，且它仅是经验分享、不构成医疗建议。</span>
      </label>
      <div className="flex gap-2 justify-end">
        <Btn variant="ghost" onClick={onCancel}>取消</Btn>
        <Btn disabled={submitting} onClick={submit}>
          {submitting ? <>审核中…</> : <><PenLine size={14} />发布</>}
        </Btn>
      </div>
    </div>
  );
}
function ShareTab({ records, showToast, initialDz }) {
  const [items, setItems] = useState(null);
  const [view, setView] = useState("browse");
  const [cat, setCat] = useState("");
  const [dz, setDz] = useState(initialDz || "");
  const [mineOnly, setMineOnly] = useState(false);
  const [adopted, setAdopted] = useState({});
  const [voted, setVoted] = useState({});
  const [uid, setUid] = useState("");

  useEffect(() => {
    (async () => {
      setUid(await getAnonId());
      setAdopted((await storGetJson("kb-adopted")) || {});
      setVoted((await storGetJson("kb-voted")) || {});
      setItems(await loadKb());
    })();
  }, []);

  const myDx = useMemo(() => {
    const s = new Set();
    records.forEach((r) => (r.dx || []).forEach((d) => s.add(d)));
    return [...s];
  }, [records]);
  const diseases = useMemo(() => {
    const s = new Set();
    (items || []).forEach((i) => (i.diseases || []).forEach((d) => s.add(d)));
    return [...s];
  }, [items]);
  const shown = useMemo(() => {
    let r = items || [];
    if (mineOnly) r = r.filter((i) => adopted[i.id]);
    if (cat) r = r.filter((i) => i.category === cat);
    if (dz === "__mine") r = r.filter((i) => (i.diseases || []).some((d) => myDx.includes(d)));
    else if (dz) r = r.filter((i) => (i.diseases || []).includes(dz));
    return r;
  }, [items, cat, dz, mineOnly, adopted, myDx]);

  const vote = async (id) => {
    if (voted[id] || !uid) return;
    try { await window.storage.set(`kbv:${id}:${uid}`, "1", true); }
    catch { showToast("网络或共享存储暂不可用"); return; }
    const nv = { ...voted, [id]: true };
    setVoted(nv); storSetJson("kb-voted", nv);
    setItems((p) => p.map((i) => (i.id === id ? { ...i, helpful: (i.helpful || 0) + 1 } : i)));
  };
  const adopt = async (item) => {
    const na = { ...adopted };
    if (na[item.id]) delete na[item.id]; else na[item.id] = { title: item.title, category: item.category, diseases: item.diseases };
    setAdopted(na); await storSetJson("kb-adopted", na);
    showToast(na[item.id] ? "已采纳到我的参考" : "已取消采纳");
  };
  const flag = async (id) => {
    if (!uid) return;
    try { await window.storage.set(`kbf:${id}:${uid}`, "1", true); showToast("已收到反馈，多人举报后将自动隐藏"); }
    catch { showToast("操作失败，请稍后再试"); }
  };

  return (
    <div>
      <div className="text-xs mb-4 px-3 py-2.5 rounded-sm" style={{ background: "#EFF3EE", color: C.inkSoft, lineHeight: 1.7 }}>
        这里是病友间的经验互助区：就医经验、康复方法、治疗期护理、指南要点。所有内容仅供参考，<span style={{ color: C.seal }}>不能替代医生的判断</span>；重大治疗决策请与主治医生确认。你的病历数据不会随分享外泄。
      </div>
      {view === "publish" ? (
        <KbPublish myDx={myDx} uid={uid} showToast={showToast}
          onCancel={() => setView("browse")}
          onPublished={(item) => { setItems((p) => [item, ...(p || [])]); setView("browse"); }} />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 items-center mb-4">
            <Chip active={!cat} onClick={() => setCat("")}>全部</Chip>
            {KB_CATS.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
            <select className="px-2.5 py-1.5 text-xs rounded-full bg-white" style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}
              value={dz} onChange={(e) => setDz(e.target.value)}>
              <option value="">全部疾病</option>
              {myDx.length > 0 && <option value="__mine">与我相关</option>}
              {diseases.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <Chip active={mineOnly} onClick={() => setMineOnly(!mineOnly)}>我采纳的</Chip>
            <span className="flex-1" />
            <Btn className="!px-3.5 !py-1.5" onClick={() => setView("publish")}><PenLine size={13} />分享经验</Btn>
          </div>
          {items === null ? (
            <div className="text-sm py-10 text-center" style={{ color: C.inkSoft }}><Spinner /> <span className="ml-2">正在加载病友分享…</span></div>
          ) : shown.length ? (
            shown.map((i) => (
              <KbCard key={i.id} item={i} voted={!!voted[i.id]} adopted={!!adopted[i.id]}
                onVote={() => vote(i.id)} onAdopt={() => adopt(i)} onFlag={() => flag(i.id)} />
            ))
          ) : (
            <Empty text={mineOnly ? "你还没有采纳过任何经验。浏览时点「采纳」，就会收进这里。"
              : "这个筛选条件下还没有分享。做第一个分享经验的人，可能正好帮到下一位病友。"}
              actionText={mineOnly ? undefined : "分享经验"} onAction={() => setView("publish")} />
          )}
        </>
      )}
    </div>
  );
}

/* ---------- 主应用 ---------- */
const TABS = [
  ["records", "档案", FileText],
  ["upload", "上传解析", Upload],
  ["timeline", "病程时间轴", Activity],
  ["progress", "疾病演进", Route],
  ["share", "病友分享", Users],
  ["settings", "设置与导出", Settings],
];

export default function App() {
  const [tab, setTab] = useState("records");
  const [subject, setSubject] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [storageOk, setStorageOk] = useState(true);
  const toastTimer = useRef(null);

  const showToast = useCallback((t) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    (async () => {
      let ok = true;
      try { if (!window.storage) throw new Error("no storage"); await window.storage.list("rec:"); }
      catch { ok = false; }
      setStorageOk(ok);
      setSubject(await storGetJson("subject"));
      setRecords(await loadAllRecords());
      setLoading(false);
    })();
    return () => clearTimeout(toastTimer.current);
  }, []);

  const refreshFromStorage = async (jump) => {
    setSubject(await storGetJson("subject"));
    setRecords(await loadAllRecords());
    if (jump) setTab(jump);
  };
  const onSaved = (rec) => {
    setRecords((p) => [rec, ...p].sort((a, b) => (b.eventStart || "").localeCompare(a.eventStart || "")));
    setTab("records");
    showToast("已存入档案");
  };
  const onDelete = async (id) => {
    try { await window.storage.delete(`rec:${id}`); } catch {}
    setRecords((p) => p.filter((r) => r.recordId !== id));
    showToast("已删除记录");
  };
  const goUpload = () => setTab("upload");
  const [sharePreset, setSharePreset] = useState("");
  const goShare = (d) => { setSharePreset(d || ""); setTab("share"); };
  const firstRun = !loading && !subject?.name && records.length === 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.paper, color: C.ink }}>
      <header className="px-5 pt-6 pb-0 max-w-3xl mx-auto w-full">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl truncate" style={{ fontFamily: SERIF, letterSpacing: "0.06em" }}>
              {subject?.name ? `${subject.name}的健康档案` : "我的健康档案"}
            </h1>
            <div className="text-xs mt-1.5" style={{ color: C.inkSoft, fontFamily: MONO }}>
              记录 {records.length} 条 · 数据仅存本机
            </div>
          </div>
          {subject?.name && <Seal name={subject.name} />}
        </div>
        <div className="mt-3" style={{ borderTop: `2.5px solid ${C.ink}` }} />
        <div style={{ borderTop: `1px solid ${C.ink}`, marginTop: 2 }} />
        <nav className="flex gap-1.5 mt-3 pb-3 overflow-x-auto" aria-label="主导航">
          {TABS.map(([k, t, Icon]) => (
            <button key={k} onClick={() => { setSharePreset(""); setTab(k); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-full whitespace-nowrap transition-colors shrink-0"
              style={tab === k
                ? { background: C.ink, color: "#fff" }
                : { color: C.inkSoft, border: `1px solid ${C.line}`, background: C.card }}
              aria-current={tab === k ? "page" : undefined}>
              <Icon size={14} strokeWidth={1.9} />{t}
            </button>
          ))}
        </nav>
      </header>

      <main className="px-5 pt-4 pb-6 max-w-3xl mx-auto w-full flex-1">
        {!loading && !storageOk && (
          <div className="mb-4 px-3 py-2.5 text-sm rounded-sm" style={{ background: "#F7ECEA", color: C.seal }}>
            本地存储不可用：当前打开方式不支持保存数据（包括载入演示数据）。请在 claude.ai 对话的 Artifact 预览中使用本应用，或刷新页面后重试。
          </div>
        )}
        {loading ? (
          <div className="text-sm py-10 text-center" style={{ color: C.inkSoft }}>正在读取本地档案…</div>
        ) : firstRun && tab === "records" ? (
          <Welcome setSubject={setSubject} goUpload={goUpload} showToast={showToast} />
        ) : (
          <>
            {!subject?.name && records.length === 0 && tab !== "settings" && tab !== "upload" && null}
            {tab === "records" && (
              subject?.name && records.length === 0
                ? <Empty text={`${subject.name}的档案已建立。上传第一张病历或报告的照片，AI 会帮你把它变成结构化记录。`}
                    actionText="上传第一份病历" onAction={goUpload} />
                : <RecordsTab records={records} onDelete={onDelete} goUpload={goUpload} />
            )}
            {tab === "upload" && <UploadTab onSaved={onSaved} />}
            {tab === "timeline" && <TimelineTab records={records} onDelete={onDelete} goUpload={goUpload} />}
            {tab === "progress" && <ProgressionTab records={records} onDelete={onDelete} showToast={showToast} goShare={goShare} goUpload={goUpload} />}
            {tab === "share" && <ShareTab records={records} showToast={showToast} initialDz={sharePreset} />}
            {tab === "settings" && <SettingsTab subject={subject} setSubject={setSubject} records={records} showToast={showToast} onDemoChange={refreshFromStorage} />}
          </>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 text-sm text-white rounded-sm shadow-lg z-50 inline-flex items-center gap-2"
          style={{ background: C.ink }} role="status">
          <Check size={14} />{toast}
        </div>
      )}

      <footer className="px-5 py-4 text-center text-xs max-w-3xl mx-auto w-full" style={{ color: C.inkSoft, borderTop: `1px solid ${C.lineSoft}`, lineHeight: 1.8 }}>
        <div>
          文件格式基于 OMAHA 开放医疗与健康联盟《"当归"个人健康档案文件格式规范》v1.0（浙江数字医疗卫生技术研究院发起 ·{" "}
          <a href="https://github.com/ChinaOMAHA/Angelica-PHR" target="_blank" rel="noopener noreferrer"
            className="underline" style={{ color: C.inkSoft }}>ChinaOMAHA/Angelica-PHR</a>）调整实现
        </div>
        <div className="mt-0.5" style={{ color: C.ink }}>
          本工具仅对个人医疗资料做整理、呈现与溯源，不提供诊断或治疗建议；健康问题请咨询医生。
        </div>
      </footer>
    </div>
  );
}
