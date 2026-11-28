#!/usr/bin/env node
// Build the three thesis PDFs from their Markdown sources.
//
// md-to-pdf names the output after the input file, so each source is copied
// into a temporary directory under its final name before rendering. The
// committed PDFs are generated artefacts; re-run this after editing a source.
//
// Usage:
//   node scripts/build_pdfs.mjs
//
// Requires network access the first time (npx downloads md-to-pdf) and a local
// Chrome/Chromium, configured in scripts/pdf-config.json.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repo = process.cwd();
const config = path.join(repo, "scripts", "pdf-config.json");
const work = path.join(tmpdir(), "metatrade-r-pdfs");

const jobs = [
  { source: "docs/METATRADE_R_IEEE_PAPER.md", name: "MetaTrade_R_IEEE_Paper" },
  { source: "docs/LITERATURE_REVIEW.md", name: "MetaTrade_R_Literature_Review_FINAL" },
  { source: "docs/THESIS_DRAFT.md", name: "Thesis_Draft_MetaTrade_R" },
];

if (!existsSync(config)) {
  console.error(`Missing ${config}`);
  process.exit(1);
}

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

for (const job of jobs) {
  const source = path.join(repo, job.source);
  if (!existsSync(source)) {
    console.error(`Missing source: ${job.source}`);
    process.exit(1);
  }
  const md = path.join(work, `${job.name}.md`);
  const pdf = path.join(work, `${job.name}.pdf`);
  copyFileSync(source, md);

  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "md-to-pdf", `${job.name}.md`, "--config-file", config],
    { cwd: work, stdio: "inherit" },
  );
  if (result.status !== 0 || !existsSync(pdf)) {
    console.error(`Failed to build ${job.source}`);
    process.exit(1);
  }
  copyFileSync(pdf, path.join(repo, "docs", `${job.name}.pdf`));
  console.log(`wrote docs/${job.name}.pdf`);
}

console.log("All PDFs rebuilt.");
