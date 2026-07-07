import { storGetJson, storSetJson } from "./storage.js";

/* 模型调用适配层：Artifact 环境走内置代理；独立部署使用用户配置的 API Key。 */
const isProxied = () => typeof window !== "undefined" && !!window.storage;
async function getAiConfig() { return (await storGetJson("ai-config")) || { apiKey: "", baseUrl: "" }; }
async function setAiConfig(cfg) { return storSetJson("ai-config", { apiKey: cfg.apiKey || "", baseUrl: cfg.baseUrl || "" }); }
async function aiComplete(body) {
  const cfg = await getAiConfig();
  const headers = { "Content-Type": "application/json" };
  if (!isProxied() || cfg.apiKey) {
    if (!cfg.apiKey) throw new Error("未配置模型 API Key：请到「设置与导出 → 模型服务」填写");
    headers["x-api-key"] = cfg.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  const base = (cfg.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const resp = await fetch(base + "/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
  return resp.json();
}

export { isProxied, getAiConfig, setAiConfig, aiComplete };
