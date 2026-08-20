import imageCompression from 'browser-image-compression';
import { api } from './api';

const COMPRESSION_OPTS = {
  maxSizeMB: 1.2,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/jpeg',
};

function isHeic(file) {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return type === 'image/heic' || type === 'image/heif'
    || name.endsWith('.heic') || name.endsWith('.heif');
}

export async function compressImage(file) {
  if (!file) return file;
  // HEIC/HEIF (het formaat van iPhone-foto's) kan door zo goed als geen enkele
  // browser rechtstreeks als <img> getoond worden. Zulke bestanden zijn vaak al
  // klein (HEIC comprimeert zelf goed), waardoor ze anders de onderstaande
  // groottedrempel niet zouden halen en ONgeconverteerd geüpload zouden worden —
  // vandaar dat we voor HEIC/HEIF altijd converteren, los van de bestandsgrootte.
  if (!isHeic(file) && file.size <= COMPRESSION_OPTS.maxSizeMB * 1024 * 1024) return file;
  try {
    return await imageCompression(file, COMPRESSION_OPTS);
  } catch (e) {
    console.warn('Compression failed, using original', e);
    return file;
  }
}

async function _uploadImage(file) {
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
  return res.json();
}

export async function uploadToCloudinary(file) {
  const data = await _uploadImage(file);
  return data.secure_url;
}

// Voor Direct Messaging-bijlagen (PRD_direct_messaging.md §6.2/§7, fase 8):
// MessageAttachment heeft naast de URL ook de effectieve bestandsgrootte
// nodig (zie backend/models.py) om de cumulatieve limiet van 5 bijlagen/
// 20 MB per Conversation client-side te kunnen aftoetsen vóór het
// versturen — de server telt dit sowieso ook af (send_message), dit is
// enkel om de gebruiker niet nodeloos tegen een 413 te laten aanlopen.
export async function uploadImageWithMeta(file) {
  const data = await _uploadImage(file);
  return { url: data.secure_url, bytes: data.bytes };
}

async function _uploadRaw(file) {
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
  return res.json();
}

export async function uploadPdfToCloudinary(file) {
  const data = await _uploadRaw(file);
  return data.secure_url;
}

// Zie uploadImageWithMeta hierboven — zelfde reden, voor bestandsbijlagen.
export async function uploadFileWithMeta(file) {
  const data = await _uploadRaw(file);
  return { url: data.secure_url, bytes: data.bytes };
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
