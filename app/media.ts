import { getSupabase } from "./supabase";

export const MAX_IMAGE_BYTES = 999_999;

export async function toWebpUnder1Mb(file: File) {
  if (!file.type.startsWith("image/")) throw Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  try {
    for (let resize = 0; resize < 6; resize++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (let quality = 0.86; quality >= 0.3; quality -= 0.08) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", quality),
        );
        if (blob?.type === "image/webp" && blob.size <= MAX_IMAGE_BYTES)
          return blob;
      }
      scale *= 0.78;
    }
  } finally {
    bitmap.close();
  }
  throw Error("image-size");
}

export async function uploadStaffImage(file: File, userId: string) {
  const blob = await toWebpUnder1Mb(file),
    c = await getSupabase();
  if (!c) throw Error("Connect to upload images.");
  const path = userId + "/staff-" + crypto.randomUUID() + ".webp";
  const { error } = await c.storage
    .from("cb-profile-media")
    .upload(path, blob, { contentType: "image/webp" });
  if (error) throw Error(error.message);
  return c.storage.from("cb-profile-media").getPublicUrl(path).data.publicUrl;
}
