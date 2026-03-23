export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5;

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCode = 1
  ) {
    super(message);
    this.name = "CliError";
  }
}

export function printError(error: unknown): never {
  if (error instanceof CliError) {
    console.error(
      JSON.stringify(
        {
          error: {
            type: error.name,
            message: error.message,
            exitCode: error.exitCode
          }
        },
        null,
        2
      )
    );
    process.exit(error.exitCode);
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify(
      {
        error: {
          type: "Error",
          message,
          exitCode: 1
        }
      },
      null,
      2
    )
  );
  process.exit(1);
}
