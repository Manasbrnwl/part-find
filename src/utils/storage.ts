import { Context } from 'hono';

/**
 * Upload a file to storage (R2 or S3)
 * @param file The file object from Hono's parseBody
 * @param folder The target folder (e.g., 'profile', 'recruiter')
 */
export const uploadFile = async (file: File, folder: string, env: any): Promise<string> => {
    // In a real Worker with R2:
    // await env.MY_BUCKET.put(`${folder}/${file.name}`, file.stream());
    // return `https://pub-xxx.r2.dev/${folder}/${file.name}`;

    // For now, since we don't have R2 bindings set up in wrangler.toml yet:
    // We will simulate a successful upload.
    console.log(`[Mock Upload] Uploading ${file.name} to ${folder}`);

    // Generate a unique name
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName = `${folder}/${file.name.replace(/\.[^/.]+$/, "")}-${uniqueSuffix}.${file.name.split('.').pop()}`;

    // If R2 binding exists (e.g. env.BUCKET), use it.
    if (env.BUCKET) {
        try {
            await env.BUCKET.put(fileName, file);
            return fileName;
        } catch (e) {
            console.error("R2 Upload Error:", e);
            throw new Error("Failed to upload file");
        }
    }

    return fileName;
};
