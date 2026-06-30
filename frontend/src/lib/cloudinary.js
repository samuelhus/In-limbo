import imageCompression from 'browser-image-compression';
import { api } from './api';

const COMPRESSION_OPTS = {
  maxSizeMB: 1.2,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/jpeg',
};

export async function compressImage(file) {
  if (!file) return file;
  if (file.size <= COMPRESSION_OPTS.maxSizeMB * 1024 * 1024) return file;
  try {
    return await imageCompression(file, COMPRESSION_OPTS);
  } catch (e) {
    console.warn('Compression failed, using original', e);
    return file;
  }
}

export async function uploadToCloudinary(file) {
  // 1. Get signature from backend
  const { data: sig } = await api.get('/cloudinary/signature');

  // 2. Compress
  const compressed = await compressImage(file);

  // 3. Upload directly to Cloudinary
  const form = new FormData();
  form.append('file', compressed);
  form.append('api_key', sig.api_key);
  form.append('timestamp', sig.timestamp);
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`,
    { method: 'POST', body: form }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Cloudinary upload mislukt: ${txt}`);
  }
  const data = await res.json();
  return data.secure_url;
}

export async function uploadPdfToCloudinary(file) {
  // 1. Get PDF-specific signature from backend
  const { data: sig } = await api.get('/cloudinary/pdf-signature');

  // 2. Upload directly to Cloudinary as raw resource type
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.api_key);
  form.append('timestamp', sig.timestamp);
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);
  form.append('access_mode', sig.access_mode);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloud_name}/raw/upload`,
    { method: 'POST', body: form }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Cloudinary PDF upload mislukt: ${txt}`);
  }
  const data = await res.json();
  return data.secure_url;
}

export function cloudinaryPdfUrl(url) {
  // Strip any transformation flags that were incorrectly added to raw URLs
  if (!url) return url;
  return url.replace(/\/raw\/upload\/[^/]+\//, '/raw/upload/');
}

export function cloudinaryThumb(url, w = 600, h = 600) {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace(
    '/upload/',
    `/upload/c_fill,w_${w},h_${h},g_auto,q_auto,f_auto/`
  );
}

// Like cloudinaryThumb, but never crops: the full image is scaled to fit
// within w x h, preserving its original aspect ratio.
export function cloudinaryFit(url, w = 1400, h = 1400) {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace(
    '/upload/',
    `/upload/c_limit,w_${w},h_${h},q_auto,f_auto/`
  );
}
