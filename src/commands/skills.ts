import fs from "node:fs/promises";

import { Command } from "commander";

import { printData } from "../output/print.js";
import {
  findSkillCatalogEntry,
  SKILL_CATALOG,
  SKILLS_ROOT_DIR,
  type SkillCatalogEntry,
  type SkillKind
} from "../skills/catalog.js";
import type { GlobalOptions } from "../types.js";

const VALID_KINDS = ["shared", "service", "helper", "recipe"] as const;

async function readSkillPreview(entry: SkillCatalogEntry, maxLines = 12): Promise<string[]> {
  try {
    const content = await fs.readFile(entry.absolutePath, "utf8");
    return content.split(/\r?\n/).slice(0, maxLines);
  } catch {
    return [];
  }
}

async function buildSkillState(entry: SkillCatalogEntry): Promise<{
  exists: boolean;
  hasFrontmatter: boolean;
  size: number;
}> {
  try {
    const stat = await fs.stat(entry.absolutePath);
    const content = await fs.readFile(entry.absolutePath, "utf8");
    return {
      exists: true,
      hasFrontmatter: content.trimStart().startsWith("---"),
      size: stat.size
    };
  } catch {
    return {
      exists: false,
      hasFrontmatter: false,
      size: 0
    };
  }
}

function parseKind(value: string | undefined): SkillKind | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (VALID_KINDS.includes(normalized as SkillKind)) {
    return normalized as SkillKind;
  }

  throw new Error(`kind 는 ${VALID_KINDS.join(", ")} 중 하나여야 합니다.`);
}

export function createSkillsCommand(getGlobals: () => GlobalOptions): Command {
  const skills = new Command("skills").description("Inspect local skill and recipe assets");

  skills
    .command("summary")
    .description("Show local skill catalog summary")
    .action(async () => {
      const globals = getGlobals();
      const entries = await Promise.all(
        SKILL_CATALOG.map(async (entry) => ({
          entry,
          state: await buildSkillState(entry)
        }))
      );

      printData(
        {
          skillsRoot: SKILLS_ROOT_DIR,
          total: entries.length,
          counts: {
            shared: entries.filter((item) => item.entry.kind === "shared").length,
            service: entries.filter((item) => item.entry.kind === "service").length,
            helper: entries.filter((item) => item.entry.kind === "helper").length,
            recipe: entries.filter((item) => item.entry.kind === "recipe").length
          },
          present: entries.filter((item) => item.state.exists).length,
          missing: entries.filter((item) => !item.state.exists).map((item) => item.entry.name)
        },
        globals.format
      );
    });

  skills
    .command("list")
    .description("List local skills and recipes")
    .option("--kind <kind>", "shared, service, helper, recipe")
    .action(async (options: { kind?: string }) => {
      const globals = getGlobals();
      const kind = parseKind(options.kind);
      const entries = kind
        ? SKILL_CATALOG.filter((entry) => entry.kind === kind)
        : SKILL_CATALOG;

      const result = await Promise.all(
        entries.map(async (entry) => {
          const state = await buildSkillState(entry);
          return {
            name: entry.name,
            kind: entry.kind,
            ...(entry.service ? { service: entry.service } : {}),
            description: entry.description,
            ...(entry.requires ? { requires: entry.requires } : {}),
            relativePath: entry.relativePath,
            absolutePath: entry.absolutePath,
            exists: state.exists,
            hasFrontmatter: state.hasFrontmatter
          };
        })
      );

      printData(result, globals.format);
    });

  skills
    .command("show")
    .description("Show one local skill or recipe")
    .requiredOption("--name <name>", "skill or recipe name")
    .action(async (options: { name: string }) => {
      const globals = getGlobals();
      const entry = findSkillCatalogEntry(options.name);
      if (!entry) {
        throw new Error(`skill 또는 recipe ${options.name} 을(를) 찾지 못했습니다.`);
      }

      const state = await buildSkillState(entry);
      const preview = await readSkillPreview(entry);
      printData(
        {
          ...entry,
          exists: state.exists,
          hasFrontmatter: state.hasFrontmatter,
          size: state.size,
          preview
        },
        globals.format
      );
    });

  skills
    .command("verify")
    .description("Verify local skill assets exist and have basic frontmatter")
    .action(async () => {
      const globals = getGlobals();
      const entries = await Promise.all(
        SKILL_CATALOG.map(async (entry) => ({
          name: entry.name,
          kind: entry.kind,
          relativePath: entry.relativePath,
          ...(entry.service ? { service: entry.service } : {}),
          ...(entry.requires ? { requires: entry.requires } : {}),
          ...(await buildSkillState(entry))
        }))
      );

      printData(
        {
          skillsRoot: SKILLS_ROOT_DIR,
          ok: entries.every((entry) => entry.exists && entry.hasFrontmatter),
          total: entries.length,
          present: entries.filter((entry) => entry.exists).length,
          missing: entries.filter((entry) => !entry.exists).map((entry) => entry.name),
          malformed: entries
            .filter((entry) => entry.exists && !entry.hasFrontmatter)
            .map((entry) => entry.name),
          entries
        },
        globals.format
      );
    });

  return skills;
}
