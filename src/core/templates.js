/* 记录类型与内容模板注册表（双层结构·内容语义层） */

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

export { RECORD_TYPES, TPL_CODESYSTEM, TPL_CODESYSTEM_NAME, TEMPLATES, tplOf, GENDERS };
