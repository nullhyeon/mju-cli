import { createRootCommand } from "./commands/root.js";
import { printError } from "./errors.js";

async function main(): Promise<void> {
  const program = createRootCommand();
  await program.parseAsync(process.argv);
}

main().catch(printError);
