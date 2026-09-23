import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const apiDirectory = new URL("../api/", import.meta.url);
const files = readdirSync(apiDirectory, { recursive: true }).filter((name) => name.endsWith(".ts"));
let failed = false;
let entrypoints = 0;

for (const name of files) {
  const path = join(apiDirectory.pathname, name);
  const source = readFileSync(path, "utf8");
  const privateFile = name.split(/[\\/]/).some(part => part.startsWith("_") || part.startsWith(".")) || name.endsWith(".d.ts");
  if (!privateFile) {
    entrypoints++;
    const parsed = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    const hasHandler = parsed.statements.some(node =>
      ts.isExportAssignment(node) && !node.isExportEquals ||
      node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword),
    );
    if (!hasHandler) {
      failed = true;
      console.error(`[serverless-check] ${name} has no default handler. Prefix utility files with _ so Vercel does not deploy them as functions.`);
    }
  }
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
console.log(`[serverless-check] ${entrypoints} API entrypoints and ${files.length - entrypoints} private helpers passed validation.`);
