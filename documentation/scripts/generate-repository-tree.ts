import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface DirectoryNode {
  name: string;
  directories: Map<string, DirectoryNode>;
  files: string[];
}

interface TreeCounts {
  directoryCount: number;
  fileCount: number;
}

interface FileTypeDefinition {
  label: string;
  extensions: string[];
  isCode: boolean;
}

interface FileTypeMetric {
  label: string;
  extensions: string[];
  isCode: boolean;
  fileCount: number;
  lineCount: number;
}

interface MetricsSummary {
  textFileCount: number;
  textLineCount: number;
  codeFileCount: number;
  codeLineCount: number;
  metrics: FileTypeMetric[];
}

type TreeEntry =
  | {
      type: "directory";
      name: string;
    }
  | {
      type: "file";
      name: string;
    };

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const documentationDir = path.resolve(scriptDir, "..");
const repositoryRoot = path.resolve(documentationDir, "..");
const outputPath = path.join(
  documentationDir,
  "site",
  "architecture",
  "repository-tree.md",
);

const FILE_TYPE_DEFINITIONS: FileTypeDefinition[] = [
  { label: "TypeScript", extensions: [".ts", ".mts", ".cts"], isCode: true },
  { label: "TSX", extensions: [".tsx"], isCode: true },
  { label: "JavaScript", extensions: [".js", ".mjs", ".cjs"], isCode: true },
  { label: "CSS", extensions: [".css", ".scss", ".less"], isCode: true },
  { label: "HTML", extensions: [".html"], isCode: true },
  { label: "Kotlin", extensions: [".kt"], isCode: true },
  { label: "Java", extensions: [".java"], isCode: true },
  { label: "C and C++", extensions: [".c", ".cc", ".cpp", ".h", ".hpp"], isCode: true },
  { label: "XML", extensions: [".xml"], isCode: false },
  { label: "Gradle", extensions: [".gradle"], isCode: false },
  { label: "Properties", extensions: [".properties"], isCode: false },
  { label: "JSON", extensions: [".json"], isCode: false },
  { label: "YAML", extensions: [".yml", ".yaml"], isCode: false },
  { label: "Markdown", extensions: [".md"], isCode: false },
  { label: "SVG", extensions: [".svg"], isCode: false },
  { label: "Shell Script", extensions: [".sh"], isCode: true },
  { label: "Batch Script", extensions: [".bat"], isCode: true },
  { label: "Plain Text", extensions: [".txt", ".lock"], isCode: false },
];

const OTHER_TEXT_FILE_TYPE: FileTypeDefinition = {
  label: "Other Text",
  extensions: [],
  isCode: false,
};

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".icns",
  ".ico",
  ".jar",
  ".exe",
  ".apk",
  ".wav",
  ".mp3",
  ".m4a",
  ".zip",
  ".blockmap",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".so",
  ".dll",
  ".bin",
  ".bpmx",
  ".bvmd",
  ".pmx",
  ".vmd",
  ".onnx",
  ".pyc",
]);

const normalizePath = (value: string): string => value.split(path.sep).join("/");

const getLineCount = (content: string): number => {
  if (content.length === 0) {
    return 0;
  }

  const newlineCount = content.match(/\n/gu)?.length ?? 0;
  return content.endsWith("\n") ? newlineCount : newlineCount + 1;
};

const getFileTypeDefinition = (relativePath: string): FileTypeDefinition | null => {
  const normalizedPath = normalizePath(relativePath);
  const baseName = path.posix.basename(normalizedPath).toLowerCase();

  if (baseName === "pre-commit" || baseName === "gradlew") {
    return {
      label: "Shell Script",
      extensions: ["(no extension)"],
      isCode: true,
    };
  }

  if (
    baseName === "license" ||
    baseName === ".gitignore" ||
    baseName === ".prettierignore"
  ) {
    return {
      label: "Plain Text",
      extensions: ["(no extension)"],
      isCode: false,
    };
  }

  const extension = path.posix.extname(baseName);

  if (BINARY_EXTENSIONS.has(extension)) {
    return null;
  }

  for (const definition of FILE_TYPE_DEFINITIONS) {
    if (definition.extensions.includes(extension)) {
      return definition;
    }
  }

  return OTHER_TEXT_FILE_TYPE;
};

const isGeneratedDocsArtifact = (relativePath: string): boolean => {
  const normalizedPath = normalizePath(relativePath);

  return (
    normalizedPath.startsWith(".vitepress/") ||
    normalizedPath.startsWith("documentation/site/.vitepress/cache/") ||
    normalizedPath.startsWith("documentation/site/.vitepress/dist/")
  );
};

const createDirectoryNode = (name = ""): DirectoryNode => ({
  name,
  directories: new Map<string, DirectoryNode>(),
  files: [],
});

const getRepositoryFileList = (): string[] => {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );

  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isGeneratedDocsArtifact(line))
    .sort((left, right) => left.localeCompare(right));
};

const insertFilePath = (root: DirectoryNode, relativeFilePath: string): void => {
  const parts = normalizePath(relativeFilePath).split("/");
  let current = root;

  for (const [index, part] of parts.entries()) {
    const isFile = index === parts.length - 1;

    if (isFile) {
      current.files.push(part);
      return;
    }

    if (!current.directories.has(part)) {
      current.directories.set(part, createDirectoryNode(part));
    }

    current = current.directories.get(part)!;
  }
};

const countTree = (node: DirectoryNode): TreeCounts => {
  let directoryCount = 0;
  let fileCount = node.files.length;

  for (const child of node.directories.values()) {
    directoryCount += 1;
    const nested = countTree(child);
    directoryCount += nested.directoryCount;
    fileCount += nested.fileCount;
  }

  return { directoryCount, fileCount };
};

const renderTree = (node: DirectoryNode, prefix = ""): string[] => {
  const directoryNames = Array.from(node.directories.keys()).sort((left, right) =>
    left.localeCompare(right),
  );
  const fileNames = [...node.files].sort((left, right) => left.localeCompare(right));
  const items: TreeEntry[] = [
    ...directoryNames.map((name) => ({ type: "directory" as const, name })),
    ...fileNames.map((name) => ({ type: "file" as const, name })),
  ];

  const lines: string[] = [];

  for (const [index, item] of items.entries()) {
    const isLast = index === items.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const nextPrefix = `${prefix}${isLast ? "    " : "│   "}`;

    if (item.type === "directory") {
      lines.push(`${prefix}${connector}${item.name}/`);
      lines.push(...renderTree(node.directories.get(item.name)!, nextPrefix));
      continue;
    }

    lines.push(`${prefix}${connector}${item.name}`);
  }

  return lines;
};

const buildTopLevelSummary = (root: DirectoryNode): string[] => {
  const entries: TreeEntry[] = [
    ...Array.from(root.directories.keys())
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({ type: "directory" as const, name })),
    ...[...root.files]
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({ type: "file" as const, name })),
  ];

  return entries.map((entry) => {
    if (entry.type === "file") {
      return `- ${entry.name}: file`;
    }

    const counts = countTree(root.directories.get(entry.name)!);
    return `- ${entry.name}/: ${counts.directoryCount + 1} directories, ${counts.fileCount} files`;
  });
};

const collectFileTypeMetrics = async (
  files: string[],
): Promise<MetricsSummary> => {
  const metricMap = new Map<string, FileTypeMetric>();
  let textFileCount = 0;
  let textLineCount = 0;
  let codeFileCount = 0;
  let codeLineCount = 0;

  for (const relativePath of files) {
    const definition = getFileTypeDefinition(relativePath);

    if (!definition) {
      continue;
    }

    const metricKey = definition.label;
    const existing = metricMap.get(metricKey) ?? {
      label: definition.label,
      extensions: [...definition.extensions],
      isCode: definition.isCode,
      fileCount: 0,
      lineCount: 0,
    };

    const content = await readFile(
      path.join(repositoryRoot, relativePath),
      "utf8",
    );
    const lineCount = getLineCount(content);

    existing.fileCount += 1;
    existing.lineCount += lineCount;
    metricMap.set(metricKey, existing);

    textFileCount += 1;
    textLineCount += lineCount;

    if (definition.isCode) {
      codeFileCount += 1;
      codeLineCount += lineCount;
    }
  }

  const metrics = Array.from(metricMap.values()).sort((left, right) => {
    if (left.isCode !== right.isCode) {
      return left.isCode ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });

  return {
    textFileCount,
    textLineCount,
    codeFileCount,
    codeLineCount,
    metrics,
  };
};

const renderMetricsTable = (metrics: FileTypeMetric[]): string => {
  const header = [
    "| File Type | Extensions | Files | Lines |",
    "| --- | --- | ---: | ---: |",
  ];
  const rows = metrics.map((metric) => {
    const extensions =
      metric.extensions.length > 0 ? metric.extensions.join(", ") : "mixed";
    return `| ${metric.label} | ${extensions} | ${metric.fileCount} | ${metric.lineCount} |`;
  });

  return [...header, ...rows].join("\n");
};

async function main(): Promise<void> {
  const files = getRepositoryFileList();
  const treeRoot = createDirectoryNode("vassist");

  for (const filePath of files) {
    insertFilePath(treeRoot, filePath);
  }

  const totals = countTree(treeRoot);
  const topLevelSummary = buildTopLevelSummary(treeRoot);
  const metricsSummary = await collectFileTypeMetrics(files);
  const renderedTree = renderTree(treeRoot);

  const markdown = `# Repository Tree

VAssist repository tree and file metrics.

## Totals

- Directories: ${totals.directoryCount}
- Files: ${totals.fileCount}
- Text files counted for metrics: ${metricsSummary.textFileCount}
- Total text lines: ${metricsSummary.textLineCount}
- Code files counted for metrics: ${metricsSummary.codeFileCount}
- Total code lines: ${metricsSummary.codeLineCount}

## Line Counts by File Type

${renderMetricsTable(metricsSummary.metrics)}

## Top-Level Summary

${topLevelSummary.join("\n")}

## Full Tree

\`\`\`text
vassist/
${renderedTree.join("\n")}
\`\`\`
`;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});