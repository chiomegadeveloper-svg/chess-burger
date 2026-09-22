import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const apiDirectory = new URL("../api/", import.meta.url);
const files = readdirSync(apiDirectory).filter((name) => name.endsWith(".ts"));
let failed = false;

for (const name of files) {
  const path = join(apiDirectory.pathname, name);
  const source = readFileSync(path, "utf8");
  const corruption = /Warning: truncated output|tokens truncated|original token count/i.test(source);
  const result = ts.transpileModule(source, {
    fileName: name,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  });
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (corruption || errors.length) {
    failed = true;
    console.error(`[serverless-check] ${name} failed validation.`);
    if (corruption) console.error("Generated/truncated tool output was found in source code.");
    for (const diagnostic of errors) {
      console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    }
  }
}

if (failed) process.exit(1);
console.log(`[serverless-check] ${files.length} API entrypoints passed syntax validation.`);
