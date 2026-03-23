import type { OutputFormat } from "../types.js";

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
  if (Array.isArray(data)) {
    console.table(data);
    return;
  }

  if (data && typeof data === "object") {
    console.table([data]);
    return;
  }

  console.log(String(data));
}
