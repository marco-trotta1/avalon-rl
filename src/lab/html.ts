import type { AuditReport } from "../audit/engine.js";

export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export function renderAuditHtml(report: AuditReport): string {
  const title = report.status === "fail" ? "Experience changed."
    : report.status === "inconclusive" ? "Evidence is incomplete." : "The stages agree.";
  const rows = report.findings.map(finding => `<tr data-severity="${finding.severity}">
    <td><span class="severity ${finding.severity}">${finding.severity}</span></td>
    <td><strong>${escapeHtml(finding.code)}</strong><p>${escapeHtml(finding.message)}</p>
    ${finding.expectedHash || finding.actualHash ? `<details><summary>Compare field fingerprints</summary>
    <p>Source <code>${escapeHtml(finding.expectedHash ?? "absent")}</code></p>
    <p>Target <code>${escapeHtml(finding.actualHash ?? "absent")}</code></p></details>` : ""}</td>
    <td>${finding.episode ?? "All"}</td><td>${finding.targetEpisode ?? "All"}</td><td>${finding.step ?? "All"}</td>
    <td><code>${escapeHtml(finding.field ?? "record")}</code></td></tr>`).join("");
  const stages = [report.source, report.target].map((stage, index) => `<div class="stage">
    <span>${index === 0 ? "Source evidence" : "Target evidence"}</span>
    <h2>${escapeHtml(stage.stage)}</h2><p>${escapeHtml(stage.producer.name)} <span class="muted">${escapeHtml(stage.producer.version)}</span></p>
    <details><summary>Snapshot fingerprint</summary><code>${escapeHtml(stage.sha256)}</code></details></div>`).join('<div class="boundary" aria-hidden="true">→</div>');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Avalon · Experience audit</title>
<style>
:root{color-scheme:light;--paper:#f6f8fc;--ink:#152246;--blue:#2147dc;--line:#d9e2f2;--red:#b42342;--amber:#995100}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Avenir Next","Segoe UI",sans-serif;font-size:16px;line-height:1.6}
header{display:flex;align-items:center;justify-content:space-between;padding:20px 5vw;border-bottom:1px solid var(--line);background:white;gap:20px}
.brand{font-size:23px;font-weight:750;letter-spacing:-1px}.brand::before{content:"";display:inline-block;width:17px;height:17px;background:var(--blue);transform:rotate(45deg);margin-right:13px;border-radius:3px}
header p{margin:0;color:#4f5d7c;font-size:14px}main{max-width:1280px;margin:auto;padding:52px 5vw}h1{font-size:clamp(38px,5vw,64px);letter-spacing:-2px;line-height:1.08;margin:16px 0 20px;font-weight:650}
h2{font-size:22px;line-height:1.3;margin:8px 0 10px}p{max-width:74ch;margin:10px 0}.intro{max-width:760px;font-size:18px;color:#4f5d7c}.badge,.severity{display:inline-flex;padding:3px 11px;border-radius:5px;font-size:13px;font-weight:650;background:#e5ebff;color:#1736a7}
.fail,.error{background:#fce8ed;color:var(--red)}.inconclusive,.unknown,.warning{background:#fff0d9;color:var(--amber)}
.path{display:grid;grid-template-columns:1fr 56px 1fr;align-items:center;margin:34px 0;border:1px solid var(--line);border-radius:12px;background:white;padding:26px 30px}.stage>span{font-size:14px;color:#4f5d7c}.stage p{margin:0 0 10px}.boundary{font-size:28px;color:var(--blue);text-align:center}.muted{color:#4f5d7c}
code{font-family:"SFMono-Regular",Consolas,monospace;font-size:12px;overflow-wrap:anywhere}details{font-size:13px}details code{display:block;margin-top:8px}summary{cursor:pointer;color:var(--blue);width:fit-content}summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #849eff;outline-offset:3px}
.stats{display:flex;gap:38px;flex-wrap:wrap;margin:30px 0 42px}.stats div{border-left:3px solid var(--line);padding-left:16px}.stats b{display:block;font-size:30px;font-weight:600;line-height:1.3}.stats span{color:#4f5d7c;font-size:14px}
.section-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:0 0 18px}.filters{display:flex;gap:10px;flex-wrap:wrap}label{display:flex;flex-direction:column;font-size:12px;gap:4px;color:#4f5d7c}input,select{font:inherit;font-size:14px;color:var(--ink);background:white;border:1px solid #b9c7df;border-radius:5px;padding:8px 10px}input{width:220px}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:9px;background:white}table{border-collapse:collapse;width:100%;text-align:left;min-width:650px}th{font-size:12px;font-weight:650;color:#4f5d7c;padding:13px 18px;background:#eef2f9}td{vertical-align:top;padding:18px;border-top:1px solid var(--line);font-size:14px}td p{font-size:13px;color:#4f5d7c;margin:5px 0}td strong{font-weight:600}tr[hidden]{display:none}
.empty{padding:22px;border:1px solid var(--line);border-radius:8px;background:white}.notes{display:grid;grid-template-columns:1.2fr 1fr;gap:40px;border-top:1px solid var(--line);padding-top:30px;margin-top:42px}.notes p,.notes li{font-size:14px;color:#4f5d7c}.notes ul{padding-left:18px}.notes h2{font-size:18px}footer{margin-top:40px;color:#4f5d7c;font-size:12px}button{font:inherit}
@media(max-width:700px){header{align-items:start;flex-direction:column;gap:5px}main{padding-top:30px}.path{grid-template-columns:1fr;padding:22px;gap:18px}.boundary{transform:rotate(90deg)}.section-head{align-items:start;flex-direction:column}.stats{gap:22px}.notes{grid-template-columns:1fr;gap:20px}.filters{width:100%}input{width:180px}}
@media print{body{background:white}header,main{padding:16px}.filters{display:none}details{break-inside:avoid}.table-wrap{overflow:visible}tr[hidden]{display:table-row}}
</style></head><body>
<header><div class="brand">Avalon</div><p>Experience audit · Local evidence</p></header>
<main><span class="badge ${report.status}">${escapeHtml(report.status)} · ${escapeHtml(report.evidence)}</span>
<h1>${title}</h1><p class="intro">Follow experience from the environment to the learner. Inspect the boundary where its meaning changes.</p>
<section class="path" aria-label="Compared stages">${stages}</section>
<div class="stats" aria-label="Audit summary"><div><b>${report.summary.comparedSteps}</b><span>Transitions compared</span></div>
<div><b>${report.summary.errors}</b><span>Errors</span></div><div><b>${report.summary.warnings}</b><span>Warnings</span></div><div><b>${report.summary.unknowns}</b><span>Unknowns</span></div></div>
<section aria-labelledby="findings-title"><div class="section-head"><div><h2 id="findings-title">Boundary findings</h2><span id="visible-count" class="muted" aria-live="polite">${report.findings.length} findings</span></div>
<div class="filters"><label>Filter findings<input id="query" type="search" placeholder="Code, field, or message"></label>
<label>Severity<select id="severity"><option value="all">All findings</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="unknown">Unknowns</option></select></label></div></div>
${rows ? `<div class="table-wrap"><table><thead><tr><th>Severity</th><th>Finding</th><th>Source episode</th><th>Target episode</th><th>Step</th><th>Field</th></tr></thead><tbody id="findings">${rows}</tbody></table></div>` : '<p class="empty">No differences are recorded. A pass applies only to these snapshots and this comparison policy.</p>'}
</section><section class="notes" aria-label="Interpretation"><div><h2>Read the evidence</h2>
<p>Termination means the task reaches a terminal state. Truncation means an external condition stops the episode. Neither proves success.</p>
<p>A bootstrap mask controls whether the learner includes estimated future value. The audit uses the declared task convention.</p>
<p>Episode numbers refer to each snapshot order. Step numbers use the recorded transition index. Hashes identify values without displaying them.</p></div>
<div><h2>Policy and limits</h2><p>Absolute tolerance ${report.policy.absoluteTolerance}. Relative tolerance ${report.policy.relativeTolerance}.</p>
<ul>${report.limits.map(limit => `<li>${escapeHtml(limit)}</li>`).join("")}</ul><p>Keep this report private. Producer labels and fingerprints can identify an asset.</p></div></section>
<footer>Avalon · ${escapeHtml(report.format)} · This file uses no external resources.</footer></main>
<script>
const query = document.getElementById('query');
const severity = document.getElementById('severity');
function filterFindings() {
  const text = query.value.toLowerCase();
  let visible = 0;
  for (const row of document.querySelectorAll('#findings tr')) {
    row.hidden = !(row.textContent.toLowerCase().includes(text) && (severity.value === 'all' || row.dataset.severity === severity.value));
    if (!row.hidden) visible += 1;
  }
  document.getElementById('visible-count').textContent = visible + ' findings';
}
query.addEventListener('input', filterFindings);
severity.addEventListener('change', filterFindings);
</script></body></html>\n`;
}
