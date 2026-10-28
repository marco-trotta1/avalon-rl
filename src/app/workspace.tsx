"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { aggregateReport, analyzeData, estimateValue, type Analysis, type Estimate } from "../lib/engine";
import { blankCase, demoCase, demoData, syntheticEpisode } from "../lib/demo";
import { MAX_FILE_BYTES, MODEL_VERSION, parseCase, rightsLabel, type AppraisalCase } from "../lib/schema";

type View = "appraisal" | "evidence" | "method" | "privacy";
type Kind = "traces" | "environment";
type IconName = "chart" | "file" | "layers" | "shield" | "upload" | "arrow" | "download" | "close" | "check";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value < 100 ? 2 : 0 }).format(value);
const number = (value: number) => new Intl.NumberFormat("en-US").format(value);

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    chart: <><path d="M4 4v16h16M8 15l4-5 4 2 4-7" /></>,
    file: <><path d="M13 3H5v18h14V9zM13 3v6h6M8 13h8M8 17h6" /></>,
    layers: <><path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6" /></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
    download: <><path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function download(value: string, filename: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PriceRange({ estimate }: { estimate: Extract<Estimate, { status: "estimated" }> }) {
  const deals = estimate.decisions.filter(deal => deal.included);
  const floor = estimate.lowUsd * 0.65;
  const ceiling = estimate.highUsd * 1.2;
  const span = ceiling - floor || 1;
  const x = (value: number) => 42 + 636 * (value - floor) / span;
  return <div className="range-figure">
    <svg viewBox="0 0 720 178" role="img" aria-label={`Observed deal range: ${money(estimate.lowUsd)} to ${money(estimate.highUsd)}. Median estimate: ${money(estimate.medianUsd)}.`}>
      <defs><linearGradient id="band"><stop stopColor="#dae2ff" /><stop offset=".5" stopColor="#b6c7ff" /><stop offset="1" stopColor="#dae2ff" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(index => <line key={index} x1={42 + 159 * index} x2={42 + 159 * index} y1="14" y2="140" stroke="#e8ecf3" strokeDasharray="3 5" />)}
      <rect x={x(estimate.lowUsd)} y="49" width={Math.max(2, x(estimate.highUsd) - x(estimate.lowUsd))} height="28" rx="14" fill="url(#band)" />
      <line x1="42" y1="63" x2="678" y2="63" stroke="#d6dde9" />
      <line x1={x(estimate.lowUsd)} y1="53" x2={x(estimate.highUsd)} y2="53" stroke="#4263d6" strokeWidth="2" transform="translate(0 10)" />
      {deals.map((deal, index) => <circle key={index} cx={x(deal.unitUsd * estimate.units)} cy={105 + index % 2 * 12} r="4" fill="#8e9dbe"><title>{`Comparable ${index + 1}: ${money(deal.unitUsd * estimate.units)}`}</title></circle>)}
      <line x1={x(estimate.medianUsd)} x2={x(estimate.medianUsd)} y1="28" y2="87" stroke="#244ac6" strokeWidth="2" />
      <circle cx={x(estimate.medianUsd)} cy="63" r="9" fill="#244ac6" stroke="white" strokeWidth="3" />
      <text x={x(estimate.lowUsd)} y="158" textAnchor="middle">{money(estimate.lowUsd)}</text>
      <text x={x(estimate.medianUsd)} y="20" textAnchor="middle" className="chart-label">Median estimate</text>
      <text x={x(estimate.highUsd)} y="158" textAnchor="middle">{money(estimate.highUsd)}</text>
    </svg>
    <div className="figure-key"><span><i className="range-key" />Observed price range</span><span><i className="deal-key" />Matched deals, scaled to your volume</span></div>
  </div>;
}

function SectionTitle({ icon, title, detail }: { icon: IconName; title: string; detail?: string }) {
  return <div className="section-title"><div><Icon name={icon} /><h2>{title}</h2></div>{detail && <span>{detail}</span>}</div>;
}

export default function Workspace() {
  const [view, setView] = useState<View>("appraisal");
  const [kind, setKind] = useState<Kind>("traces");
  const [appraisal, setAppraisal] = useState<AppraisalCase | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const caseInput = useRef<HTMLInputElement>(null);
  const dataInput = useRef<HTMLInputElement>(null);
  const estimate = useMemo(() => appraisal && analysis ? estimateValue({ appraisal, analysis }) : null, [appraisal, analysis]);
  const unit = kind === "traces" ? "episodes" : "task specs";

  function clear(nextKind: Kind = kind) {
    generation.current++;
    setAppraisal(null); setAnalysis(null); setError(null); setBusy(false); setKind(nextKind);
    if (caseInput.current) caseInput.current.value = "";
    if (dataInput.current) dataInput.current.value = "";
  }

  async function loadDemo(nextKind: Kind = kind) {
    clear(nextKind);
    const run = generation.current;
    setBusy(true);
    try {
      const nextCase = demoCase(nextKind);
      const nextAnalysis = await analyzeData({ text: demoData(nextKind), kind: nextKind });
      if (run === generation.current) { setAppraisal(nextCase); setAnalysis(nextAnalysis); }
    } catch { if (run === generation.current) setError("The synthetic example cannot load. Reload the page."); }
    finally { if (run === generation.current) setBusy(false); }
  }

  async function importCase(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clear();
    const run = generation.current;
    setBusy(true);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("The appraisal file exceeds 10 MiB.");
      const next = parseCase(await file.text());
      if (run === generation.current) { setAppraisal(next); setKind(next.asset.kind); }
    } catch (cause) {
      if (run === generation.current) setError(cause instanceof Error ? cause.message : "Check the appraisal file format.");
    } finally { if (run === generation.current) setBusy(false); }
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !appraisal) return;
    const run = ++generation.current;
    setAnalysis(null); setBusy(true); setError(null);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("The data file exceeds 10 MiB.");
      const next = await analyzeData({ text: await file.text(), kind: appraisal.asset.kind });
      if (run === generation.current) setAnalysis(next);
    } catch (cause) {
      if (run === generation.current) setError(cause instanceof Error ? cause.message : "Check the data file format.");
    } finally { if (run === generation.current) setBusy(false); }
  }

  function exportReport() {
    if (!appraisal || !analysis || !estimate) return;
    download(JSON.stringify(aggregateReport({ appraisal, analysis, estimate }), null, 2), "traceatlas-private-report.json");
  }

  const nav: { view: View; title: string; icon: IconName }[] = [
    { view: "appraisal", title: "Appraisal", icon: "chart" },
    { view: "evidence", title: "Deal evidence", icon: "layers" },
    { view: "method", title: "Method", icon: "file" },
    { view: "privacy", title: "Privacy", icon: "shield" },
  ];

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar">
      <a href="/" className="brand" aria-label="TraceAtlas home"><span className="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 9h20M6 16h20M6 23h20" /><circle cx="12" cy="9" r="3" /><circle cx="21" cy="16" r="3" /><circle cx="15" cy="23" r="3" /></svg></span>TraceAtlas<span className="version">Private workspace</span></a>
      <div className="top-actions"><span className="local-badge"><Icon name="shield" size={15} />Local processing</span><button className="quiet-button" onClick={() => clear()}>Clear session</button></div>
    </header>

    <aside className="sidebar">
      <p className="workspace-label">Your workspace</p>
      <nav aria-label="Workspace">{nav.map(item => <button key={item.view} className={`nav-button ${view === item.view ? "active" : ""}`} aria-current={view === item.view ? "page" : undefined} onClick={() => setView(item.view)}><Icon name={item.icon} />{item.title}{item.view === "evidence" && appraisal && <span className="nav-count">{appraisal.comparables.length}</span>}</button>)}</nav>
      <div className="sidebar-divider" />
      <div className="session-status"><span className="status-dot" />{appraisal ? "Appraisal in this session" : "No asset loaded"}</div>
      <div className="sidebar-note"><Icon name="shield" size={25} /><h3>Your files stay here.</h3><p>Analysis runs in this browser. Files are not uploaded or saved by the app.</p><button className="text-button" onClick={() => setView("privacy")}>Review privacy controls</button></div>
      <div className="sidebar-bottom"><span>Session storage</span><strong>Memory only</strong><span>No account required</span></div>
    </aside>

    <main id="main" tabIndex={-1}>
      <div className="page-heading"><div><p className="breadcrumb">Workspace <span>/</span> {nav.find(item => item.view === view)?.title}</p><h1>{view === "appraisal" ? "A price you can trace." : view === "evidence" ? "The evidence behind the price." : view === "method" ? "Every assumption, in the open." : "Private from the first file."}</h1><p className="page-intro">{view === "appraisal" ? "Estimate the licensing or sale price of RL environments and data traces." : view === "evidence" ? "Completed transactions anchor the estimate. Every exclusion has a reason." : view === "method" ? "A transparent comparable-deal model. No hidden quality multipliers." : "Inspect locally. Keep control of the data and the report."}</p></div><button className="outline-button" onClick={() => { clear(); setView("appraisal"); }}>New appraisal <Icon name="arrow" size={17} /></button></div>

      {error && <div className="error-message" role="alert"><strong>Check the file.</strong> {error}<button aria-label="Dismiss error" onClick={() => setError(null)}><Icon name="close" size={17} /></button></div>}
      {appraisal?.evidenceMode === "synthetic" && <div className="demo-banner"><span><strong>Synthetic demonstration</strong> · The asset, deals, and prices are invented.</span><button onClick={() => clear()}>Start with your data <Icon name="arrow" size={16} /></button></div>}
      <div className="busy-status" role="status" aria-live="polite">{busy ? "Analyzing locally. Keep this tab open." : ""}</div>

      {view === "appraisal" && <>
        <div className="appraisal-layout">
          <section className="intake-panel" aria-label="Appraisal inputs">
            <div className="intake-heading"><h2>The asset</h2><span className="small-tag">USD</span></div>
            <div className="kind-toggle" aria-label="Asset type"><button aria-pressed={kind === "traces"} onClick={() => clear("traces")}>Data traces</button><button aria-pressed={kind === "environment"} onClick={() => clear("environment")}>RL environment</button></div>
            <div className={`input-step ${appraisal ? "complete" : ""}`}><span className="step-number">{appraisal ? <Icon name="check" size={15} /> : "1"}</span><div><h3>Define the deal</h3><p>Import the asset terms, rights evidence, and comparable transactions.</p><button className="outline-button full-button" disabled={busy} onClick={() => caseInput.current?.click()}><Icon name="upload" size={16} />{appraisal ? "Replace appraisal file" : "Choose appraisal JSON"}</button></div></div>
            <div className={`input-step ${analysis ? "complete" : ""}`}><span className="step-number">{analysis ? <Icon name="check" size={15} /> : "2"}</span><div><h3>Inspect the data</h3><p>{kind === "traces" ? "One episode per JSONL record, with aligned observation and action arrays." : "A JSON task manifest with reset, verifier, and declared test evidence."}</p><button className="outline-button full-button" disabled={!appraisal || busy} onClick={() => dataInput.current?.click()}><Icon name="file" size={16} />{analysis ? "Replace data file" : kind === "traces" ? "Choose trace JSONL" : "Choose environment JSON"}</button></div></div>
            <p className="file-limit">10 MiB per file · Up to 20,000 records</p>
            <div className="intake-links"><button className="text-button" onClick={() => download(blankCase(kind), "traceatlas-appraisal-template.json")}>Download appraisal template</button><button className="text-button" onClick={() => setView("method")}>View file formats</button></div>
            <div className="demo-invite"><p>See the full workflow first.</p><button className="secondary-button" disabled={busy} onClick={() => loadDemo()}>Explore synthetic demo <Icon name="arrow" size={16} /></button></div>
          </section>

          <section className="valuation-panel" aria-label="Market appraisal">
            <div className="valuation-top"><span className="valuation-label">{appraisal ? rightsLabel(appraisal.asset.rights) : "Market appraisal"}</span><span className={`result-badge ${estimate?.status === "estimated" ? "provisional" : ""}`}>{appraisal?.evidenceMode === "synthetic" ? "Synthetic result" : estimate?.status === "estimated" ? "Provisional estimate" : "Evidence required"}</span></div>
            <h2 className="asset-name">{appraisal?.asset.name || (kind === "traces" ? "Your trace dataset" : "Your RL environment")}</h2>
            {estimate?.status === "estimated" ? <>
              <div className="price-row"><span className="main-price">{money(estimate.medianUsd)}</span><span className="price-caption">Estimated {appraisal?.asset.rights.type === "assignment" ? "sale" : "license"} price<br /><span>for {number(estimate.units)} eligible {unit}</span></span></div>
              <PriceRange estimate={estimate} />
              <div className="estimate-facts"><div><span>Observed deal range</span><strong>{money(estimate.lowUsd)} to {money(estimate.highUsd)}</strong></div><div><span>Matching transactions</span><strong>{estimate.sampleSize} counterparty groups</strong></div><div><span>Evidence date</span><strong>{estimate.asOfDate}</strong></div></div>
              <div className="estimate-note"><Icon name="file" size={17} /><p>The range reflects observed deal prices. It is not a statistical confidence interval.</p></div>
            </> : <div className="empty-valuation"><div className="empty-chart" aria-hidden="true"><div /><div /><div /><div /><div /><span /></div><h3>{estimate ? "The evidence does not support a price yet." : "Start with the asset. Build the evidence."}</h3><p>{estimate ? "Resolve the evidence gaps below. The app will calculate a price when the requirements are met." : "Import your deal scope and data. The estimate will show its calculation, matched deals, and limits."}</p>{estimate?.status === "withheld" && <ul className="gap-list">{estimate.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}{!estimate && <button className="text-button" disabled={busy} onClick={() => loadDemo()}>Preview an appraisal with synthetic data <Icon name="arrow" size={16} /></button>}</div>}
          </section>
        </div>

        <section className="analysis-panel"><SectionTitle icon="layers" title="What the analyzer found" detail={analysis ? `${number(analysis.records)} source records` : "No data inspected"} />
          <div className="metric-grid"><div><span>Eligible {unit}</span><strong>{analysis ? number(analysis.eligibleUnits) : "--"}</strong><p>{kind === "traces" ? "Complete, exact duplicates removed" : "Distinct specs with declared passing tests"}</p></div><div><span>Exact duplicates</span><strong>{analysis ? number(analysis.duplicateUnits) : "--"}</strong><p>Excluded from the priced volume</p></div><div><span>{kind === "traces" ? "Incomplete episodes" : "Missing or failed tests"}</span><strong>{analysis ? number(analysis.incompleteUnits) : "--"}</strong><p>{kind === "traces" ? "No final termination or truncation" : "Declared receipts need complete passes"}</p></div><div><span>Invalid or conflicting</span><strong>{analysis ? number(analysis.invalidUnits + analysis.conflictingUnits) : "--"}</strong><p>Schema errors or reused identifiers</p></div></div>
          {analysis && <div className="analysis-footnote"><span>{kind === "traces" ? `${number(analysis.steps)} eligible steps · ${number(analysis.distinctTasks)} declared task IDs` : "Static inspection only. Environment code does not run."}</span><button className="text-button" onClick={() => setView("evidence")}>Inspect the evidence <Icon name="arrow" size={16} /></button></div>}
        </section>

        <div className="bottom-grid"><section className="calculation-panel"><SectionTitle icon="chart" title="The calculation" /><div className="formula"><div><strong>{analysis ? number(analysis.eligibleUnits) : "--"}</strong><span>eligible {unit}</span></div><span className="operator">×</span><div><strong>{estimate?.status === "estimated" ? money(estimate.medianUnitUsd) : "--"}</strong><span>median price per unit</span></div><span className="operator">=</span><div><strong>{estimate?.status === "estimated" ? money(estimate.medianUsd) : "--"}</strong><span>estimated price</span></div></div><p>Only matching rights, term, domain, modality, and use enter the median.</p></section><section className="export-panel"><Icon name="download" size={24} /><h2>Keep the evidence with the number.</h2><p>Download the aggregate report. It omits raw data, names, and contract references. Counts and prices remain private.</p><button className="primary-button" disabled={!estimate || busy} onClick={exportReport}>Download private report <Icon name="download" size={16} /></button></section></div>
      </>}

      {view === "evidence" && <>
        <section className="evidence-summary"><div><span>Imported transactions</span><strong>{appraisal?.comparables.length ?? 0}</strong></div><div><span>Matching groups</span><strong>{estimate?.sampleSize ?? "--"}</strong></div><div><span>Minimum required</span><strong>3</strong></div><div><span>Review status</span><strong className="text-value">Author attested</strong></div></section>
        <div className="notice"><Icon name="file" /><p>Document hashes identify the declared sources. The app does not open contracts or confirm that a transaction occurred.</p></div>
        <section className="table-panel"><SectionTitle icon="layers" title="Comparable transactions" detail={appraisal ? rightsLabel(appraisal.asset.rights) : "Import an appraisal to begin"} />
          {estimate ? <div className="table-scroll"><table><thead><tr><th>Deal</th><th>Date</th><th>USD per unit</th><th>Decision</th></tr></thead><tbody>{estimate.decisions.map((deal, index) => <tr key={index}><td><strong>{deal.id}</strong><span className="cell-detail">{deal.evidenceType}</span></td><td>{deal.date}</td><td>{money(deal.unitUsd)}</td><td><span className={`decision-badge ${deal.included ? "included" : ""}`}>{deal.included ? "Included" : "Excluded"}</span><span className="cell-detail">{deal.reason}</span></td></tr>)}</tbody></table></div> : <div className="table-empty"><h3>{appraisal ? "Inspect the data to match transactions." : "Your private deal ledger starts here."}</h3><p>Use documented completed deals. Quotes and asking prices remain visible, but do not enter the estimate.</p><button className="outline-button" onClick={() => setView("appraisal")}>Open appraisal <Icon name="arrow" size={16} /></button></div>}
        </section>
        {estimate?.status === "estimated" && <section className="validation-panel"><h2>Check the simple baseline</h2><p>Leave out each matching transaction. Predict its unit price with the median of the remaining transactions.</p><div><strong>{estimate.leaveOneOutMedianErrorPct.toFixed(1)}%</strong><span>Median absolute percentage error · n={estimate.sampleSize} held-out deals<br />Same imported ledger. No independent test set. No quality adjustment.</span></div><p>This diagnostic does not establish accuracy for a new asset. Compute cost is not metered. No paid model API runs.</p></section>}
        {analysis && <section className="table-panel"><SectionTitle icon="file" title="Data inspection" detail="Up to 25 diagnostic records" /><div className="inspection-details"><p><strong>Source SHA-256</strong><code className="hash">{analysis.inputSha256}</code></p><p>{analysis.kind === "traces" ? `${analysis.terminatedUnits} eligible episodes terminate. ${analysis.truncatedUnits} eligible episodes truncate. Either flag can end an episode.` : `${analysis.declaredTestUnits} task specs contain declared passing test receipts. The receipts are not independently verified.`}</p>{analysis.diagnostics.length ? <ul className="diagnostic-list">{analysis.diagnostics.map((item, index) => <li key={index}>Record {item.record}<span>{item.reason}</span></li>)}</ul> : <p>No record exclusions.</p>}</div></section>}
      </>}

      {view === "method" && <div className="reading-layout"><article className="reading-panel"><h2>Comparable deals set the price.</h2><p>The model prices eligible units using completed deals from a private ledger. Each deal must match the asset scope.</p><ol className="method-steps"><li><h3>Inspect the asset</h3><p>Trace arrays must align and contain a final termination or truncation. Exact duplicate content counts once, even if identifiers change.</p><p>Environment task specs need an instruction, initial state, reset definition, verifier, and declared passing test receipt.</p></li><li><h3>Match the transactions</h3><p>Match the asset type, domain, modality, use, rights, and license term. Accept USD transactions within 365 days.</p><p>Use volumes within 0.25 to 4 times the subject volume. Include one deal per counterparty group and source document.</p></li><li><h3>Calculate the estimate</h3><p>Divide each deal price by its eligible unit count. Multiply the median unit price by the subject count.</p><p>The observed minimum and maximum unit prices produce the displayed range. The range has no claimed probability coverage.</p></li><li><h3>State the limits</h3><p>The model requires at least 3 matching groups and documented provenance and transfer rights. Missing evidence withholds the estimate.</p><p>The thresholds are product policies. They are not experimentally calibrated. Linear unit pricing can miss bundle discounts and scarce capabilities.</p></li></ol><h2>Research informs the inspection.</h2><div className="source-list"><a href="https://minari.farama.org/content/dataset_standards/" target="_blank" rel="noreferrer"><strong>Minari dataset standards</strong><span>Episode arrays and source metadata. The import format is a JSON export, not a native HDF5 reader.</span></a><a href="https://gymnasium.farama.org/tutorials/gymnasium_basics/handling_time_limits/" target="_blank" rel="noreferrer"><strong>Gymnasium: time limits</strong><span>Termination and truncation remain distinct. A terminal flag does not mean task success.</span></a><a href="https://arxiv.org/abs/2004.07219" target="_blank" rel="noreferrer"><strong>D4RL</strong><span>Dataset composition matters for offline RL. Record count alone does not establish training utility.</span></a><a href="https://proceedings.mlr.press/v97/ghorbani19c.html" target="_blank" rel="noreferrer"><strong>Data Shapley</strong><span>Model contribution depends on the task and metric. This app does not compute Shapley values.</span></a></div><p className="method-version">Model: {MODEL_VERSION} · Sources reviewed: 2026-10-27</p></article><aside className="format-panel"><h2>Bring your own evidence.</h2><p>Use the documented JSON formats. Raw data stays in this session.</p><h3>Appraisal file</h3><p>Asset scope, rights evidence, appraisal date, and comparable transactions.</p><button className="outline-button full-button" onClick={() => download(blankCase(kind), "traceatlas-appraisal-template.json")}>Download blank template</button><h3>Trace data</h3><p>One JSONL record per episode. Observations include the initial and final states.</p><button className="outline-button full-button" onClick={() => download(JSON.stringify(syntheticEpisode(0)), "synthetic-episode.jsonl", "application/x-ndjson")}>Download synthetic episode</button><h3>Environment data</h3><p>A JSON task manifest. Code is inspected as declarations and is never executed.</p><button className="outline-button full-button" onClick={() => download(demoData("environment"), "synthetic-environment.json")}>Download synthetic manifest</button><h3>Deal format</h3><p>This example contains invented transactions. Replace every deal with documented evidence.</p><button className="outline-button full-button" onClick={() => download(JSON.stringify(demoCase(kind), null, 2), "synthetic-appraisal-example.json")}>Download synthetic ledger</button></aside></div>}

      {view === "privacy" && <div className="reading-layout"><article className="reading-panel"><div className="privacy-symbol"><Icon name="shield" size={40} /></div><h2>The browser does the work.</h2><p>File contents pass directly from the file picker to the analyzer. The app has no upload endpoint, account, database, or analytics.</p><div className="privacy-row"><Icon name="check" /><div><h3>No automatic storage</h3><p>The app does not write files to browser storage. Reloading or clearing the session releases the app references.</p></div></div><div className="privacy-row"><Icon name="check" /><div><h3>No analysis network access</h3><p>The production server blocks browser connections with a Content Security Policy. App assets load from the local server.</p></div></div><div className="privacy-row"><Icon name="check" /><div><h3>Explicit report export</h3><p>Only the download button creates a report. It contains counts, a source fingerprint, deal terms, and price results.</p><p>The report omits raw observations, actions, asset names, deal identifiers, counterparty names, and contract references.</p></div></div><div className="privacy-row"><Icon name="check" /><div><h3>Local server only</h3><p>The production server binds to 127.0.0.1 and checks the Host header. It does not accept file uploads.</p></div></div><h2>Keep the device private too.</h2><p>Browser extensions, device administrators, screen capture, and malware can access browser data. Memory release is not secure erasure.</p><p>Keep real datasets and contracts outside the repository. Store exported reports in a private location.</p><p>The repository contains code and synthetic examples. Repository privacy does not replace device security.</p><button className="primary-button" onClick={() => clear()}>Clear the current session <Icon name="close" size={16} /></button></article><aside className="format-panel"><h2>Privacy controls</h2><dl className="privacy-facts"><div><dt>Processing</dt><dd>In this browser</dd></div><div><dt>App data retention</dt><dd>Session memory</dd></div><div><dt>External AI services</dt><dd>None</dd></div><div><dt>Telemetry</dt><dd>None</dd></div><div><dt>Report creation</dt><dd>Explicit download</dd></div><div><dt>Hosted deployment</dt><dd>Not configured</dd></div></dl><p>Use the production start command for the restrictive network policy. The development server supports local development connections.</p></aside></div>}
      <footer className="page-footer"><span>TraceAtlas · Private appraisal workspace</span><span>Evidence first. Every estimate is provisional.</span></footer>
    </main>
    <input ref={caseInput} type="file" accept=".json,application/json" hidden onChange={importCase} aria-label="Import appraisal JSON" />
    <input ref={dataInput} type="file" accept={kind === "traces" ? ".jsonl,.ndjson" : ".json,application/json"} hidden onChange={importData} aria-label="Import asset data" />
  </div>;
}
