import { nowIso } from "./utils.js";
import { tplOf } from "./templates.js";
import { storGetJson, storSetJson, storSetJsonShared, storDelete } from "../adapters/storage.js";

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
  for (const id of DEMO_REC_IDS) await storDelete(`rec:${id}`);
  for (const id of DEMO_KB_IDS) await storDelete(`kb:${id}`, true);
}

export { DEMO_REC_IDS, DEMO_KB_IDS, buildDemoRecords, buildDemoKb, seedDemoData, clearDemoData };
