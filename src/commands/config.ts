import { Command } from "commander";

import { resolveRuntimeConfig } from "../config/runtime.js";
import { printData } from "../output/print.js";
import type { GlobalOptions } from "../types.js";

export function createConfigCommand(getGlobals: () => GlobalOptions): Command {
  const config = new Command("config").description("Inspect CLI configuration and storage paths");

  config
    .command("show")
    .description("Show current runtime configuration")
    .action(() => {
      const globals = getGlobals();
      const runtime = resolveRuntimeConfig({ appDir: globals.appDir });

      printData(
        {
          appDir: runtime.appDir,
          storage: runtime.storage,
          env: {
            MJU_CLI_APP_DIR: process.env.MJU_CLI_APP_DIR ?? null
          }
        },
        globals.format
      );
    });

  config
    .command("paths")
    .description("Show resolved storage directories")
    .action(() => {
      const globals = getGlobals();
      const runtime = resolveRuntimeConfig({ appDir: globals.appDir });
      printData(runtime.storage, globals.format);
    });

  return config;
}
