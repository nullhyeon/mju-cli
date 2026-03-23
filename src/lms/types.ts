export interface DecodedResponse {
  statusCode: number;
  url: string;
  text: string;
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface BinaryResponse {
  statusCode: number;
  url: string;
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface SsoForm {
  action: string;
  c_r_t: string;
  publicKey: string;
}

export interface CourseCandidate {
  title: string;
  href: string;
}

export interface LoginSnapshotResult {
  loggedIn: boolean;
  usedSavedSession: boolean;
  mainFinalUrl: string;
  cookieCount: number;
  courseCandidatesCount: number;
  sessionPath: string;
  mainHtmlPath: string;
  coursesPath: string;
}
