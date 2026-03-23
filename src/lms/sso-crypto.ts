import {
  constants,
  createCipheriv,
  pbkdf2Sync,
  publicEncrypt,
  randomBytes
} from "node:crypto";

export interface SsoKeyMaterial {
  keyStr: string;
  key: Buffer;
  iv: Buffer;
}

export function genSsoKeyMaterial(): SsoKeyMaterial {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(64);
  let keyStr = "";

  for (let index = 0; index < 64; index += 1) {
    keyStr += chars[bytes[index]! % chars.length];
  }

  const salt = Buffer.from(keyStr.slice(-16), "utf8");
  const key = pbkdf2Sync(Buffer.from(keyStr, "utf8"), salt, 1024, 32, "sha1");
  const iv = key.subarray(key.length - 16);

  return { keyStr, key, iv };
}

export function encryptPasswordForSso(value: string, key: Buffer, iv: Buffer): string {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(encoded, "utf8")),
    cipher.final()
  ]);

  return encrypted.toString("base64");
}

export function encryptSessionKeyForSso(value: string, publicKeyBase64: string): string {
  const pemKey =
    "-----BEGIN PUBLIC KEY-----\n" +
    publicKeyBase64.replace(/ /g, "+") +
    "\n-----END PUBLIC KEY-----";

  const encrypted = publicEncrypt(
    {
      key: pemKey,
      padding: constants.RSA_PKCS1_PADDING
    },
    Buffer.from(value, "utf8")
  );

  return encrypted.toString("base64");
}
