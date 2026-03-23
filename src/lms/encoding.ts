import iconv from "iconv-lite";

type HeaderValue = string | string[] | undefined;

function firstHeaderValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeCharset(value: string | undefined): string | undefined {
  const charset = value?.trim().toLowerCase();
  if (!charset) {
    return undefined;
  }

  if (charset === "ks_c_5601-1987" || charset === "x-windows-949") {
    return "cp949";
  }

  if (charset === "euc_kr") {
    return "euc-kr";
  }

  return charset;
}

function detectCharset(
  rawBody: Buffer,
  headers: Record<string, HeaderValue>
): string | undefined {
  const contentType = firstHeaderValue(headers["content-type"]);
  const headerCharset = normalizeCharset(/charset=([^;]+)/i.exec(contentType ?? "")?.[1]);
  if (headerCharset) {
    return headerCharset;
  }

  const headSample = rawBody.subarray(0, 4096).toString("ascii");
  const metaCharset = normalizeCharset(
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(headSample)?.[1] ??
      /content=["'][^"']*charset=([\w-]+)/i.exec(headSample)?.[1]
  );

  return metaCharset;
}

export function decodeHtml(
  rawBody: Buffer,
  headers: Record<string, HeaderValue>
): string {
  const charset = detectCharset(rawBody, headers);
  if (charset && iconv.encodingExists(charset)) {
    return iconv.decode(rawBody, charset);
  }

  return rawBody.toString("utf8");
}
