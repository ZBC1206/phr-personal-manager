/* 通用工具 */

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

export { uuid4, nowIso, normDateTime, fmtDate, esc, numOf, rangeOf, splitList };
