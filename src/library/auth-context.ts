import type { ResolvedLmsCredentials } from "../auth/types.js";
import { MjuLibraryClient } from "./client.js";
import type { LibraryUserInfo } from "./types.js";

interface RawBranch {
  id?: number;
  name?: string;
  alias?: string;
}

interface RawLibraryMyInfo {
  id?: number;
  name?: string;
  memberNo?: string;
  branch?: RawBranch;
}

export interface LibraryAuthContext {
  user: LibraryUserInfo;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }

  return value;
}

function ensureNumber(value: number | undefined, message: string): number {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}

function ensureString(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

export async function getLibraryAuthContext(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials
): Promise<LibraryAuthContext> {
  const { myInfo } = await client.ensureAuthenticated<RawLibraryMyInfo>(
    credentials.userId,
    credentials.password
  );
  const branchId = cleanNumber(myInfo.branch?.id);
  const branchName = cleanString(myInfo.branch?.name);
  const branchAlias = cleanString(myInfo.branch?.alias);

  return {
    user: {
      id: ensureNumber(myInfo.id, "도서관 사용자 id 를 찾지 못했습니다."),
      name: ensureString(myInfo.name, "도서관 사용자 이름을 찾지 못했습니다."),
      memberNo: ensureString(myInfo.memberNo, "도서관 사용자 학번을 찾지 못했습니다."),
      ...(branchId !== undefined ? { branchId } : {}),
      ...(branchName !== undefined ? { branchName } : {}),
      ...(branchAlias !== undefined ? { branchAlias } : {})
    }
  };
}
