import type { OutputFormat } from "../types.js";
import { printGenericTable, printKnownTableFormat } from "./table-formatters.js";

export function printData(data: unknown, format: OutputFormat): void {
  switch (format) {
    case "json":
      console.log(JSON.stringify(data, null, 2));
      return;
    case "table":
      printTableish(data);
      return;
  }
}

function printTableish(data: unknown): void {
  if (printKnownTableFormat(data)) {
    return;
  }

  printGenericTable(data);
}
