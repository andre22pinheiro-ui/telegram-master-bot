import "dotenv/config";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "rjcfdrpn";
const API_KEY = process.env.CLOUDINARY_API_KEY || "358642419643238";
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || "ml_default";

// Upload de buffer de imagem para Cloudinary CDN
export async function uploadToCloudinary(buffer, filename = "telegram_upload") {
  try {
    const base64Data = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

    const body = new URLSearchParams({
      file: base64Data,
      upload_preset: UPLOAD_PRESET,
      tags: "telegram,multimodal,autonomous"
    });

    const res = await fetch(url, {
      method: "POST",
      body: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(6000)
    });

    const data = await res.json();
    if (data.secure_url) {
      return {
        success: true,
        url: data.secure_url,
        format: data.format,
        bytes: data.bytes
      };
    }
    return { success: false, error: data.error?.message || "Erro no upload Cloudinary" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

