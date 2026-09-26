import { getSupabase } from "./supabase";

export const MAX_IMAGE_BYTES = 600_000;
const MAX_IMAGE_EDGE = 1600;

export function validateImageFile(file: File) {
  if (!file.size) throw Error("This photo is empty or damaged.");
  if (!file.type.startsWith("image/") && !/\.(heic|heif|avif|jxl|tif|tiff|bmp|gif|jpe?g|png|webp)$/i.test(file.name))
    throw Error("Choose a photo file.");
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
}

async function nextPaint() {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve()),
  );
}

async function compressImageSource(
  source: CanvasImageSource,
  width: number,
  height: number,
  initialScale = 1,
  maxBytes = MAX_IMAGE_BYTES,
) {
  const canvas = document.createElement("canvas");
  let scale = initialScale;
  try {
    for (let resize = 0; resize < 8; resize++) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw Error("This browser cannot process images.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(source, 0, 0, canvas.width, canvas.height);

      for (let quality = 0.86; quality >= 0.3; quality -= 0.08) {
        const blob = await canvasBlob(canvas, quality);
        if (blob?.type === "image/webp" && blob.size <= maxBytes)
          return blob;
      }
      scale *= 0.78;
      await nextPaint();
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message)
      throw cause;
    throw Error("This photo could not be processed.");
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
  throw Error(`The photo could not be reduced below ${Math.round(maxBytes / 1000)} KB.`);
}

export async function loadImageFile(file: File) {
  validateImageFile(file);
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(Error("This browser cannot open that photo format. Export it as JPEG or PNG and try again."));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight)
      throw Error("This photo is empty or damaged.");
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => {
        image.removeAttribute("src");
        URL.revokeObjectURL(url);
      },
    };
  } catch (error) {
    image.removeAttribute("src");
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function canvasToWebpUnder1Mb(canvas: HTMLCanvasElement) {
  return compressImageSource(canvas, canvas.width, canvas.height);
}

async function toWebp(file: File, maxBytes: number) {
  const loaded = await loadImageFile(file);
  try {
    await nextPaint();
    const initialScale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(loaded.width, loaded.height),
    );
    return await compressImageSource(
      loaded.image,
      loaded.width,
      loaded.height,
      initialScale,
      maxBytes,
    );
  } finally {
    loaded.dispose();
  }
}

export const toWebpUnder1Mb = (file: File) => toWebp(file, MAX_IMAGE_BYTES);
export const toWebpUnder500Kb = (file: File) => toWebp(file, 499_000);

export async function uploadStaffImage(file: File, userId: string) {
  const blob = await toWebpUnder1Mb(file);
  const client = await getSupabase();
  if (!client) throw Error("Connect to upload images.");
  const randomId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const path = userId + "/staff-" + randomId + ".webp";
  const { error } = await client.storage
    .from("cb-profile-media")
    .upload(path, blob, {
      contentType: "image/webp",
      cacheControl: "31536000",
    });
  if (error) throw Error(/bucket not found/i.test(error.message)
    ? "Photo storage is not set up. Run supabase/0046_announcement_photo_repair.sql in Supabase."
    : /permission|policy|unauthoriz/i.test(error.message)
      ? "Photo upload was denied. Run supabase/0046_announcement_photo_repair.sql in Supabase."
      : error.message);
  return client.storage.from("cb-profile-media").getPublicUrl(path).data.publicUrl;
}
