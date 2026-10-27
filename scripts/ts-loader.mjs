import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  // Handle "@/..." path alias
  if (specifier.startsWith("@/")) {
    const relPath = specifier.slice(2);
    const resolvedUrl = resolveWithTsExtensions(path.resolve(projectRoot, relPath));
    if (resolvedUrl) {
      return { url: resolvedUrl, shortCircuit: true };
    }
  }

  // Handle relative imports without file extensions
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL
  ) {
    const parentPath = new URL(context.parentURL);
    const baseDir = path.dirname(
      process.platform === "win32"
        ? decodeURIComponent(parentPath.pathname.slice(1))
        : decodeURIComponent(parentPath.pathname)
    );
    const resolvedUrl = resolveWithTsExtensions(path.resolve(baseDir, specifier));
    if (resolvedUrl) {
      return { url: resolvedUrl, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}

function resolveWithTsExtensions(candidateBase) {
  const candidates = [
    candidateBase,
    `${candidateBase}.ts`,
    `${candidateBase}.tsx`,
    `${candidateBase}.mts`,
    `${candidateBase}.js`,
    path.join(candidateBase, "index.ts"),
    path.join(candidateBase, "index.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return pathToFileURL(c).href;
    }
  }
  return null;
}

