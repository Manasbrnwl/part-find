/**
 * Image storage abstraction.
 *
 * When S3_BUCKET is set, images live in S3 (durable, survives instance
 * replacement). When it's unset, everything falls back to the local disk exactly
 * as before — so nothing breaks in dev or before the env var is configured.
 *
 * Credentials come from the default AWS provider chain — on EC2 that's the
 * attached instance role, so no keys are stored anywhere.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { ensureDirExists } from "../../utils/default";
import { logger } from "../../utils/logger";

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || process.env.S3_REGION || "ap-south-1";

export const isS3Enabled = !!BUCKET;

const s3 = isS3Enabled ? new S3Client({ region: REGION }) : null;

if (isS3Enabled) {
  logger.info(`Image storage: S3 bucket "${BUCKET}" (${REGION})`);
} else {
  logger.info("Image storage: local disk (S3_BUCKET not set)");
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

/** Resolve the on-disk directory for a category (local-fallback mode only). */
function localDir(category: string): string {
  if (category === "aadhaar") {
    return process.env.AADHAAR_UPLOAD_DIR || path.join(UPLOAD_DIR, "aadhaar");
  }
  return path.join(UPLOAD_DIR, category);
}

/** Strip any path separators so a filename can't escape its prefix/dir. */
function safeName(filename: string): string {
  return path.basename(filename);
}

/**
 * Store an image buffer under `<category>/<filename>` (S3 key) or the matching
 * local directory.
 */
export async function storeImage(
  category: string,
  filename: string,
  buffer: Buffer,
  contentType = "image/jpeg"
): Promise<void> {
  const name = safeName(filename);
  if (isS3Enabled && s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `${category}/${name}`,
        Body: buffer,
        ContentType: contentType,
      })
    );
  } else {
    const dir = localDir(category);
    ensureDirExists(dir);
    await fs.promises.writeFile(path.join(dir, name), buffer);
  }
}

/**
 * Fetch an image as a readable stream + content type, or null if it doesn't
 * exist. Caller pipes the stream to the HTTP response.
 */
export async function getImage(
  category: string,
  filename: string
): Promise<{ stream: Readable; contentType: string } | null> {
  const name = safeName(filename);
  if (isS3Enabled && s3) {
    try {
      const res = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: `${category}/${name}` })
      );
      return {
        stream: res.Body as Readable,
        contentType: res.ContentType || "image/jpeg",
      };
    } catch (err: any) {
      const notFound =
        err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
      if (!notFound) throw err;
      // Fall through: image may predate S3 and still live on the local disk.
    }
  }
  const filePath = path.join(localDir(category), name);
  if (!fs.existsSync(filePath)) return null;
  return { stream: fs.createReadStream(filePath), contentType: "image/jpeg" };
}

/** Best-effort delete of a stored image (never throws). */
export async function deleteImage(category: string, filename: string): Promise<void> {
  const name = safeName(filename);
  try {
    if (isS3Enabled && s3) {
      await s3.send(
        new DeleteObjectCommand({ Bucket: BUCKET, Key: `${category}/${name}` })
      );
    } else {
      await fs.promises.unlink(path.join(localDir(category), name));
    }
  } catch {
    /* ignore — cleanup is best-effort */
  }
}
