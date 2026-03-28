import { Command } from "commander";

import { APP_DESCRIPTION, APP_NAME, APP_VERSION } from "../app-meta.js";
import { createAuthCommand } from "./auth.js";
import { registerGlobalOptions, resolveGlobalOptions } from "./common.js";
import { createConfigCommand } from "./config.js";
import { createDoctorCommand } from "./doctor.js";
import { createLibraryCommand } from "./library.js";
import { createLmsCommand } from "./lms.js";
import { createMsiCommand } from "./msi.js";
import { createServiceCommands } from "./services.js";
import { createSkillsCommand } from "./skills.js";
import { createUcheckCommand } from "./ucheck.js";

export function createRootCommand(): Command {
  const program = new Command();

  program
    .name("mju")
    .description(APP_DESCRIPTION)
    .version(APP_VERSION, "-V, --version", `${APP_NAME} version`)
    .showHelpAfterError();

  registerGlobalOptions(program);

  const getGlobals = () => resolveGlobalOptions(program);

  program.addCommand(createAuthCommand(getGlobals));
  program.addCommand(createConfigCommand(getGlobals));
  program.addCommand(createDoctorCommand(getGlobals));
  program.addCommand(createLibraryCommand(getGlobals));
  program.addCommand(createLmsCommand(getGlobals));
  program.addCommand(createMsiCommand(getGlobals));
  program.addCommand(createSkillsCommand(getGlobals));
  program.addCommand(createUcheckCommand(getGlobals));

  for (const serviceCommand of createServiceCommands(getGlobals)) {
    program.addCommand(serviceCommand);
  }

  return program;
}
