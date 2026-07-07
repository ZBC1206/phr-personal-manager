import { aiComplete } from "../adapters/ai.js";
import { RECORD_TYPES, tplOf } from "./templates.js";

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
  const data = await aiComplete({
      model: MODEL, max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
          { type: "text", text: buildParsePrompt() },
        ],
      }],
  });
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

export { MODEL, compressImage, parseMedicalImage };
