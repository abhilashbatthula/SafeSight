import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import { ServiceUnavailableException } from '@nestjs/common';
const root = () => path.resolve(process.env.STORAGE_DIR || '.runtime/uploads');
const cloud = () => process.env.STORAGE_ADAPTER === 'cloudinary';
function configure() {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  )
    throw new ServiceUnavailableException(
      'Cloudinary credentials missing; configure them or use the local storage adapter',
    );
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}
export async function storeImage(id: string, bytes: Buffer): Promise<string> {
  if (cloud()) {
    configure();
    return new Promise((resolve, reject) => {
      const s = cloudinary.uploader.upload_stream(
        {
          public_id: `safesight/${id}`,
          resource_type: 'image',
          type: 'authenticated',
          format: 'png',
        },
        (err, r) =>
          err || !r
            ? reject(err ?? new Error('Cloudinary upload failed'))
            : resolve(`cloudinary:${r.public_id}`),
      );
      s.end(bytes);
    });
  }
  await mkdir(root(), { recursive: true, mode: 0o700 });
  await writeFile(path.join(root(), `${id}.png`), bytes, { mode: 0o600 });
  return `local:${id}.png`;
}
export async function imageBytes(key: string) {
  if (key.startsWith('cloudinary:')) {
    configure();
    const url = cloudinary.url(key.slice(11), {
      type: 'authenticated',
      secure: true,
      sign_url: true,
      format: 'png',
    });
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error('Cloudinary private delivery failed');
    return Buffer.from(await res.arrayBuffer());
  }
  if (!/^local:[\da-f-]+\.png$/.test(key))
    throw new Error('Invalid local storage key');
  return readFile(path.join(root(), key.slice(6)));
}
export async function deleteImage(key: string) {
  if (key.startsWith('cloudinary:')) {
    configure();
    await cloudinary.uploader.destroy(key.slice(11), {
      type: 'authenticated',
      invalidate: true,
    });
  } else {
    if (!/^local:[\da-f-]+\.png$/.test(key)) throw new Error('Invalid key');
    await unlink(path.join(root(), key.slice(6))).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT') throw e;
      },
    );
  }
}
