import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Storage helper for Cloudflare R2 (S3-compatible Object Storage).
 * Handles file uploads and deletions for scanned debit PDFs and Excel report snapshots.
 */

export interface UploadStorageOptions {
  file: File | Blob | Buffer;
  fileName: string;
  customFileName?: string;
  contentType?: string;
}

export interface UploadStorageResult {
  url: string;
  fileName: string;
}

function getR2Client(): { client: S3Client; bucket: string; publicUrl: string } | null {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || "uep-storage";
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!endpoint || !accessKeyId || !secretAccessKey || !publicUrl) {
    return null;
  }

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return { client, bucket, publicUrl: publicUrl.replace(/\/+$/, "") };
}

function detectContentType(fileName: string, providedType?: string): string {
  if (providedType && providedType !== "application/octet-stream") {
    return providedType;
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export async function uploadToStorage(
  options: UploadStorageOptions
): Promise<UploadStorageResult> {
  const safeFileName = options.customFileName || options.fileName;
  const r2 = getR2Client();

  // Convert incoming file to Buffer
  let fileBuffer: Buffer;
  let fileContentType = options.contentType;

  if (Buffer.isBuffer(options.file)) {
    fileBuffer = options.file;
  } else if (options.file instanceof Blob) {
    const arrayBuffer = await options.file.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
    if (!fileContentType && "type" in options.file && options.file.type) {
      fileContentType = options.file.type;
    }
  } else {
    throw new Error("Formato de archivo inválido para almacenamiento.");
  }

  const contentType = detectContentType(safeFileName, fileContentType);

  // 1. Primary: Cloudflare R2
  if (r2) {
    const command = new PutObjectCommand({
      Bucket: r2.bucket,
      Key: safeFileName,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await r2.client.send(command);

    return {
      url: `${r2.publicUrl}/${safeFileName}`,
      fileName: safeFileName,
    };
  }

  // 2. Fallback: Legacy HTTP Server API (if STORAGE_API_URL is configured)
  const apiUrl = process.env.STORAGE_API_URL;
  const apiKey = process.env.STORAGE_API_KEY || "UEP_STORAGE_SECRET_KEY_2026";

  if (!apiUrl) {
    throw new Error(
      "No se encontró configuración de almacenamiento. Defina las credenciales de Cloudflare R2 (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL) en el archivo .env."
    );
  }

  const formData = new FormData();
  const uint8 = new Uint8Array(fileBuffer);
  const blob = new Blob([uint8], { type: contentType });
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

export async function deleteFromStorage(fileUrlOrKey: string): Promise<boolean> {
  const r2 = getR2Client();
  if (!r2 || !fileUrlOrKey) return false;

  try {
    // Extract key from URL if a full URL was provided
    let key = fileUrlOrKey;
    if (fileUrlOrKey.startsWith("http://") || fileUrlOrKey.startsWith("https://")) {
      const urlObj = new URL(fileUrlOrKey);
      key = decodeURIComponent(urlObj.pathname.replace(/^\/+/, ""));
    }

    const command = new DeleteObjectCommand({
      Bucket: r2.bucket,
      Key: key,
    });

    await r2.client.send(command);
    return true;
  } catch (err) {
    console.error("Error deleting object from Cloudflare R2:", err);
    return false;
  }
}
