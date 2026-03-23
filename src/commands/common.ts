import type { Command } from "commander";

import type { GlobalOptions, OutputFormat } from "../types.js";

export function registerGlobalOptions(command: Command): Command {
  return command
    .option("--app-dir <path>", "override local app data directory")
    .option(
      "--format <format>",
      "output format: json (default), table",
      "json"
    );
}

export function resolveGlobalOptions(command: Command): GlobalOptions {
  const options = command.opts<{ appDir?: string; format?: string }>();
  const format = normalizeFormat(options.format);

  return {
    appDir: options.appDir,
    format
  };
}

function normalizeFormat(format: string | undefined): OutputFormat {
  if (format === "json" || format === "table" || format === undefined) {
    return format ?? "json";
  }

  throw new Error(`지원하지 않는 출력 형식입니다: ${format}`);
}
