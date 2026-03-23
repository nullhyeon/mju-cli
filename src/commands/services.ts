import { Command } from "commander";

import { printData } from "../output/print.js";
import { SERVICES, type ServiceSpec } from "../services/registry.js";
import type { GlobalOptions } from "../types.js";

export function createServiceCommands(getGlobals: () => GlobalOptions): Command[] {
  return SERVICES
    .filter(
      (service) =>
        service.name !== "lms" && service.name !== "msi" && service.name !== "ucheck"
    )
    .map((service) => createServiceCommand(service, getGlobals));
}

function createServiceCommand(
  service: ServiceSpec,
  getGlobals: () => GlobalOptions
): Command {
  const serviceCommand = new Command(service.name).description(service.description);

  serviceCommand
    .command("summary")
    .description("Show the planned command surface for this service")
    .action(() => {
      const globals = getGlobals();
      printData(
        {
          service: service.name,
          description: service.description,
          resources: service.resources,
          helpers: service.helpers
        },
        globals.format
      );
    });

  for (const helper of service.helpers) {
    serviceCommand
      .command(helper.name)
      .description(`${helper.description} (planned helper surface)`)
      .action(() => {
        const globals = getGlobals();
        printData(
          {
            service: service.name,
            helper: helper.name,
            description: helper.description,
            status: "planned"
          },
          globals.format
        );
      });
  }

  return serviceCommand;
}
