import { Command } from "commander";

import { resolveRuntimeConfig } from "../config/runtime.js";
import { printData } from "../output/print.js";
import type { GlobalOptions } from "../types.js";

export function createDoctorCommand(getGlobals: () => GlobalOptions): Command {
  return new Command("doctor")
    .description("Check local runtime prerequisites")
    .action(() => {
      const globals = getGlobals();
      const runtime = resolveRuntimeConfig({ appDir: globals.appDir });

      printData(
        {
          ok: true,
          stage: "skeleton",
          node: process.version,
          platform: process.platform,
          appDir: runtime.appDir,
          checks: [
            "config path resolution ready",
            "service registry ready",
            "auth migration pending",
            "service implementation migration pending"
          ]
        },
        globals.format
      );
    });
}
