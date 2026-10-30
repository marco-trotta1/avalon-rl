import { describe, expect, it } from "vitest";
import { auditSnapshots } from "../src/audit/engine.js";
import { demoPair } from "../src/lab/demo.js";
import { renderAuditHtml } from "../src/lab/html.js";

describe("offline report", () => {
  it("explains a mismatch without external resources or raw observations", () => {
    const html = renderAuditHtml(auditSnapshots(demoPair({ fault: "reward-shift" })));
    expect(html).toContain("Experience changed.");
    expect(html).toContain("transition.changed");
    expect(html).toContain('id="query"');
    expect(html).not.toContain("https:");
    expect(html).not.toContain("counter-7");
    expect(html).not.toContain('"count":');
    expect(html).toContain("Content-Security-Policy");
  });
  it("escapes supplied labels and messages before the browser reads them", () => {
    const report = auditSnapshots(demoPair({ fault: "none" }));
    report.source.producer.name = '</div><script>alert("private")</script>';
    report.limits.push('<img src=x onerror="alert(1)">');
    const html = renderAuditHtml(report);
    expect(html).not.toContain('<script>alert("private")</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("The stages agree.");
  });
});
