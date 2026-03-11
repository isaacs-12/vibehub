import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

const BUCKET = process.env.S3_BUCKET ?? 'vibehub-artifacts';

/** Store a vibe artifact (feature Markdown, requirements YAML) in S3. */
export async function putArtifact(key: string, body: string): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: 'text/plain; charset=utf-8',
    }),
  );
}

/** Retrieve a vibe artifact from S3. Returns null if not found. */
export async function getArtifact(key: string): Promise<string | null> {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!res.Body) return null;
    return res.Body.transformToString('utf-8');
  } catch {
    return null;
  }
}
