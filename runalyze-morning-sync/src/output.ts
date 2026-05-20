import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeJson(outputDir: string, filename: string, data: unknown): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, filename);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return path;
}

export async function writeMarkdown(outputDir: string, filename: string, markdown: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, filename);
  await writeFile(path, markdown, "utf8");
  return path;
}
