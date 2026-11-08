import type { ReactMutation } from "convex/react";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// Uploads a recording to Convex storage and registers it as the user's.
export async function uploadRecording(
  blob: Blob,
  generateUploadUrl: ReactMutation<typeof api.recordings.generateUploadUrl>,
  save: ReactMutation<typeof api.recordings.save>,
) {
  const uploadUrl = await generateUploadUrl();
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
  const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
  return await save({ storageId, mediaType: blob.type });
}
