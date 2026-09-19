import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { get } from "node:https";
import type { IncomingMessage } from "node:http";
import { BlockList, isIP } from "node:net";
import path from "node:path";
import { config } from "../config";
import { XaiFailure } from "../xai/video";

const trustedHosts: Record<string, true> = {
  "imgen.x.ai": true,
  "vidgen.x.ai": true,
};
// Node matches IPv4 and IPv4-mapped IPv6 across families. Keep these lists
// separate so blocking the mapped IPv6 prefix does not block every IPv4 host.
const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();
for (const [network, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blockedIpv4.addSubnet(network, bits, "ipv4");
for (const [network, bits] of [
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blockedIpv6.addSubnet(network, bits, "ipv6");

export function validateProviderUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new XaiFailure(
      "UNSAFE_MEDIA_URL",
      "The provider returned an invalid media destination.",
    );
  }
  if (
    url.protocol !== "https:" ||
    trustedHosts[url.hostname] !== true ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new XaiFailure(
      "UNSAFE_MEDIA_URL",
      "The provider returned an untrusted media destination.",
    );
  }
  return url;
}

export async function mediaPath(relative: string): Promise<string> {
  if (!relative || path.isAbsolute(relative))
    throw new Error("Invalid local media path");
  const root = await realpath(config.mediaDir);
  const resolved = await realpath(path.resolve(root, relative));
  if (!resolved.startsWith(`${root}${path.sep}`))
    throw new Error("Invalid local media path");
  return resolved;
}

export async function atomicMediaWrite(
  relative: string,
  content: string | Uint8Array,
): Promise<void> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(relative))
    throw new Error("Invalid asset name");
  await mkdir(config.mediaDir, { recursive: true });
  const destination = path.join(config.mediaDir, relative);
  const temporary = `${destination}.${randomUUID()}.part`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(content);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, destination);
    const directory = await open(config.mediaDir, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export async function downloadProviderMedia(
  value: string,
  id: string,
  type: "image" | "video",
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid media identifier");
  const url = validateProviderUrl(value);
  const addresses = await lookup(url.hostname, {
    all: true,
    verbatim: true,
  }).catch(() => {
    throw new XaiFailure(
      "MEDIA_DOWNLOAD_FAILED",
      "The generated media host could not be reached. No automatic paid retry was started.",
      true,
    );
  });
  if (
    !addresses.length ||
    addresses.some(
      ({ address, family }) =>
        isIP(address) !== family ||
        (family === 4
          ? blockedIpv4.check(address, "ipv4")
          : blockedIpv6.check(address, "ipv6")),
    )
  )
    throw new XaiFailure(
      "UNSAFE_MEDIA_URL",
      "The media destination did not resolve to a public address.",
    );
  const target = addresses[0];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  let temporary: string | undefined;
  let response: IncomingMessage | undefined;
  try {
    // Pin the validated DNS answer. No redirects, cookies, authorization, or second DNS lookup.
    const { promise, resolve, reject } =
      Promise.withResolvers<IncomingMessage>();
    const request = get(
      url,
      {
        signal: controller.signal,
        family: target.family,
        headers: {
          Accept:
            type === "video"
              ? "video/mp4, video/webm"
              : "image/jpeg, image/png, image/webp",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, target.address, target.family),
      },
      resolve,
    );
    request.on("error", reject);
    response = await promise;
    if (response.statusCode !== 200) {
      const status = response.statusCode ?? 0;
      response.destroy();
      if (status === 429 || status >= 500)
        throw new XaiFailure(
          "MEDIA_DOWNLOAD_FAILED",
          "The generated media is temporarily unavailable. No automatic paid retry was started.",
          true,
        );
      if (status >= 300 && status < 400)
        throw new XaiFailure(
          "UNSAFE_MEDIA_URL",
          "The media destination attempted an untrusted redirect.",
        );
      if (status === 404 || status === 410)
        throw new XaiFailure(
          "MEDIA_EXPIRED",
          "The generated media URL expired before it could be saved.",
        );
      throw new XaiFailure(
        "MEDIA_DOWNLOAD_FAILED",
        "The generated media could not be downloaded.",
      );
    }
    const mime =
      response.headers["content-type"]?.split(";")[0].trim().toLowerCase() ??
      "";
    const extension = mimeExtensions[mime];
    if (!extension || !mime.startsWith(`${type}/`)) {
      response.destroy();
      throw new XaiFailure(
        "MEDIA_INVALID_TYPE",
        "The generated media had an unsupported content type.",
      );
    }
    const limit = type === "video" ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
    const declared = Number(response.headers["content-length"]);
    if (declared > limit) {
      response.destroy();
      throw new XaiFailure(
        "MEDIA_TOO_LARGE",
        "The generated asset exceeded the local storage size limit.",
      );
    }
    await mkdir(config.mediaDir, { recursive: true });
    const relative = `${id}.${extension}`;
    const destination = path.join(config.mediaDir, relative);
    temporary = `${destination}.${randomUUID()}.part`;
    const file = await open(temporary, "wx", 0o600);
    let size = 0;
    let prefix = Buffer.alloc(0);
    try {
      for await (const chunk of response) {
        const bytes = chunk as Buffer;
        size += bytes.length;
        if (size > limit) {
          response.destroy();
          throw new XaiFailure(
            "MEDIA_TOO_LARGE",
            "The generated asset exceeded the local storage size limit.",
          );
        }
        if (prefix.length < 16)
          prefix = Buffer.concat([
            prefix,
            bytes.subarray(0, 16 - prefix.length),
          ]);
        await file.writeFile(bytes);
      }
      const valid =
        mime === "image/jpeg"
          ? prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff
          : mime === "image/png"
            ? prefix
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : mime === "image/webp"
              ? prefix.toString("ascii", 0, 4) === "RIFF" &&
                prefix.toString("ascii", 8, 12) === "WEBP"
              : mime === "video/mp4"
                ? prefix.toString("ascii", 4, 8) === "ftyp"
                : prefix.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
      if (Number.isFinite(declared) && declared > 0 && size !== declared)
        throw new XaiFailure(
          "MEDIA_DOWNLOAD_FAILED",
          "The media download was interrupted. No automatic paid retry was started.",
          true,
        );
      if (!valid || size < 16)
        throw new XaiFailure(
          "MEDIA_INVALID_CONTENT",
          "The downloaded media did not match its content type.",
        );
      await file.sync();
    } finally {
      await file.close();
      response.destroy();
    }
    await rename(temporary, destination);
    const directory = await open(config.mediaDir, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return relative;
  } catch (error) {
    if (error instanceof XaiFailure) throw error;
    throw new XaiFailure(
      "MEDIA_DOWNLOAD_FAILED",
      "The generated media could not be saved safely. No automatic paid retry was started.",
      true,
    );
  } finally {
    clearTimeout(timeout);
    response?.destroy();
    if (temporary) await unlink(temporary).catch(() => {});
  }
}
