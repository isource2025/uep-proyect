/**
 * Client helper to upload files to the physical server storage via Cloudflare Tunnel.
 * Replaces @vercel/blob with direct, private server storage.
 */

export interface UploadStorageOptions {
  file: File | Blob | Buffer;
  fileName: string;
  customFileName?: string;
}

export interface UploadStorageResult {
  url: string;
  fileName: string;
}

export async function uploadToStorage(
  options: UploadStorageOptions
): Promise<UploadStorageResult> {
  const apiUrl = process.env.STORAGE_API_URL;
  const apiKey = process.env.STORAGE_API_KEY || "UEP_STORAGE_SECRET_KEY_2026";

  if (!apiUrl) {
    throw new Error(
      "La variable de entorno STORAGE_API_URL no está configurada en .env."
    );
  }

  const formData = new FormData();

  let blob: Blob;
  if (options.file instanceof Blob) {
    blob = options.file;
  } else if (Buffer.isBuffer(options.file)) {
    // Convert Node Buffer to Uint8Array Blob
    const uint8Array = new Uint8Array(options.file);
    blob = new Blob([uint8Array]);
  } else {
    throw new Error("Formato de archivo inválido para almacenamiento.");
  }

  const safeFileName = options.customFileName || options.fileName;
  formData.append("file", blob, safeFileName);
  if (options.customFileName) {
    formData.append("customFileName", options.customFileName);
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    let errorMsg = `Error HTTP ${response.status} en servidor de almacenamiento.`;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // response wasn't JSON
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  if (!data.success || !data.url) {
    throw new Error(data.error || "Respuesta inválida del servidor de almacenamiento.");
  }

  return {
    url: data.url,
    fileName: data.fileName || safeFileName,
  };
}
