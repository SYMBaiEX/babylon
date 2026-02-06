/**
 * Upload an image to the app's image API (Vercel Blob or MinIO).
 * Used by edit profile and onboarding for profile/cover image uploads.
 */

export type UploadImageType = 'profile' | 'cover';

/**
 * Upload a file to /api/upload/image and return the public URL.
 * @param file - Image file to upload
 * @param type - 'profile' or 'cover'
 * @param accessToken - Privy access token (required for auth)
 * @returns The public URL of the uploaded image
 * @throws Error if the request fails or token is missing
 */
export async function uploadImage(
  file: File,
  type: UploadImageType,
  accessToken: string | null
): Promise<string> {
  if (!accessToken) {
    throw new Error('Authentication required');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);

  const response = await fetch('/api/upload/image', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Upload failed');
  }

  const data = (await response.json()) as { url: string };
  return data.url;
}
