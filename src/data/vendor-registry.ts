import { vendors } from "@/data/vendors";
import { uploadById, uploadToInbox } from "@/state/uploads";
import type { VendorInbox } from "@/lib/types";

/** Resolves both the seeded demo mailbox and buyer-uploaded vendor responses. */
export function vendorMeta(id: string): VendorInbox | undefined {
  const seeded = vendors.find((v) => v.id === id);
  if (seeded) return seeded;
  const up = uploadById(id);
  return up ? uploadToInbox(up) : undefined;
}

export const vendorLabel = (id: string) => vendorMeta(id)?.name ?? id;
export const vendorShortLabel = (id: string) => vendorMeta(id)?.shortName ?? id;
