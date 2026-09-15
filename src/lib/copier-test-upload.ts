import cloudinary from "@/lib/cloudinary";

export const COPIER_TEST_ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png"];
export const COPIER_TEST_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export interface CopierTestUploadResult {
  secureUrl: string;
  publicId: string;
}

export function validateCopierTestImage(file: File): string | null {
  if (!file || file.size === 0) {
    return "صورة الاختبار مطلوبة";
  }
  if (!COPIER_TEST_ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return "نوع الصورة غير مدعوم — المسموح فقط: jpg, jpeg, png";
  }
  if (file.size > COPIER_TEST_MAX_SIZE_BYTES) {
    return "حجم الصورة يتجاوز الحد الأقصى (5MB)";
  }
  return null;
}

export async function uploadCopierTestImage(
  file: File,
  customerId: string,
): Promise<CopierTestUploadResult> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `copier-tests/${customerId}`,
          resource_type: "image",
        },
        (error, result) => {
          if (error || !result) reject(error ?? new Error("Upload failed"));
          else resolve(result as { secure_url: string; public_id: string });
        },
      );
      uploadStream.end(buffer);
    },
  );

  return { secureUrl: result.secure_url, publicId: result.public_id };
}

export async function deleteCopierTestImage(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (error) {
    console.error("[copier-tests] Failed to delete image from Cloudinary:", error);
  }
}
