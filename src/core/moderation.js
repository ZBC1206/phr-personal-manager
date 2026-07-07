import { aiComplete } from "../adapters/ai.js";
import { MODEL } from "./parser.js";

const KB_SCREEN_PROMPT = `你是患者互助社区的内容安全审核员。审核下面这条病友分享，只输出一个JSON对象，不要任何其他文字：{"level":"ok"或"warn"或"block","reasons":["简短中文原因"],"suggest":"一句修改建议"}。
判定 block（拦截）的情形：鼓动停止或替代正规治疗；给出具体药物剂量、用药方案等指令性医疗建议；宣传以偏方替代手术放化疗；包含他人可识别隐私（电话、证件号、完整住址）；辱骂攻击特定个人；广告、引流、售卖。
判定 warn（放行但提示）的情形：个人经验涉及具体治疗细节但仅陈述自身经历、未鼓动他人照做；对医院或医生的主观负面评价。
判定 ok：一般性康复经验、护理注意事项、就医流程与科室信息、指南内容的客观转述。
block 时 suggest 必填，说明如何修改后可以发布。`;
async function screenKb(f) {
  const payload = `分类：${f.category}\n相关疾病：${(f.diseases || []).join("、") || "未填"}\n来源：${f.sourceType}${f.sourceRef ? "（" + f.sourceRef + "）" : ""}\n标题：${f.title}\n正文：${f.content}`;
  const data = await aiComplete({
      model: MODEL, max_tokens: 1000,
      messages: [{ role: "user", content: KB_SCREEN_PROMPT + "\n---\n" + payload }],
  });
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

export { screenKb };
