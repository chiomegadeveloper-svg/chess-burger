import { getSupabase } from "./supabase";

export const MAX_IMAGE_BYTES = 999_999;
const MAX_SOURCE_IMAGE_BYTES = 25_000_000;
const MAX_IMAGE_EDGE = 1600;

function canvasBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
}

async function compressImageSource(
  source: CanvasImageSource,
  width: number,
  height: number,
  initialScale = 1,
) {
  let scale = initialScale;
  for (let resize = 0; resize < 8; resize++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("This browser cannot process images.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    for (let quality = 0.88; quality >= 0.28; quality -= 0.08) {
      const blob = await canvasBlob(canvas, quality);
      if (blob?.type === "image/webp" && blob.size <= MAX_IMAGE_BYTES)
        return blob;
    }
    scale *= 0.78;
  }
  throw Error("The image could not be reduced below 1 MB.");
}

export async function loadImageFile(file: File) {
  if (file.type && !file.type.startsWith("image/"))
    throw Error("Choose an image file.");
  if (file.size > MAX_SOURCE_IMAGE_BYTES)
    throw Error("Choose an image smaller than 25 MB.");

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(Error("This image cannot be opened. Try JPEG, PNG or WebP."));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight)
      throw Error("This image is empty or damaged.");
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function canvasToWebpUnder1Mb(canvas: HTMLCanvasElement) {
  return compressImageSource(canvas, canvas.width, canvas.height);
}

export async function toWebpUnder1Mb(file: File) {
  const loaded = await loadImageFile(file);
  try {
    const initialScale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(loaded.width, loaded.height),
    );
    return await compressImageSource(
      loaded.image,
      loaded.width,
      loaded.height,
      initialScale,
    );
  } finally {
    loaded.dispose();
  }
}

export async function uploadStaffImage(file: File, userId: string) {
  const blob = await toWebpUnder1Mb(file),
    c = await getSupabase();
  if (!c) throw Error("Connect to upload images.");
  const path = userId + "/staff-" + crypto.randomUUID() + ".webp";
  const { error } = await c.storage
    .from("cb-profile-media")
    .upload(path, blob, {
      contentType: "image/webp",
      cacheControl: "31536000",
    });
  if (error) throw Error(error.message);
  return c.storage.from("cb-profile-media").getPublicUrl(path).data.publicUrl;
}
