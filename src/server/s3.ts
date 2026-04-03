import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

const S3_SENTINEL_PREFIX = "s3::";

export function isS3Reference(body: string): boolean {
  return body.startsWith(S3_SENTINEL_PREFIX);
}

export function makeS3Reference(key: string): string {
  return `${S3_SENTINEL_PREFIX}${key}`;
}

export function extractS3Key(body: string): string {
  return body.slice(S3_SENTINEL_PREFIX.length);
}

export class ObjectStore {
  private client: S3Client;
  private bucket: string;

  constructor(private config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async put(key: string, body: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: "text/plain; charset=utf-8",
      })
    );
  }

  async get(key: string): Promise<string> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    return (await res.Body?.transformToString("utf-8")) ?? "";
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }
}

/**
 * Non-AWS endpoints (MinIO, localstack, etc.) require path-style access
 * because virtual-hosted style (bucket.host) won't DNS-resolve locally.
 * Auto-detect unless explicitly overridden via env var.
 */
function inferForcePathStyle(endpoint: string): boolean {
  const override = process.env.AAC_S3_FORCE_PATH_STYLE;
  if (override !== undefined) return override === "true";
  // Only AWS S3 endpoints support virtual-hosted style reliably
  return !endpoint.includes(".amazonaws.com");
}

export function loadS3ConfigFromEnv(): S3Config | null {
  const endpoint = process.env.AAC_S3_ENDPOINT;
  if (!endpoint) return null;

  const accessKeyId = process.env.AAC_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AAC_S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;

  return {
    endpoint,
    region: process.env.AAC_S3_REGION ?? "us-east-1",
    bucket: process.env.AAC_S3_BUCKET ?? "aac-messages",
    accessKeyId,
    secretAccessKey,
    forcePathStyle: inferForcePathStyle(endpoint),
  };
}
