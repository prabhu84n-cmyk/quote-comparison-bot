import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Sends the RFQ invitation to vendors. Until a sender email domain is
 * configured for the project, returns { configured: false } so the client
 * can fall back to opening the user's own mail client.
 */
export const sendRfqInvite = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        rfqId: z.string(),
        recipients: z.array(z.string().email()).min(1),
        subject: z.string().min(1),
        body: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    // A verified sender domain has not been configured for this project yet,
    // so managed sending is unavailable. Signal the client to use its
    // mailto fallback. Once a domain is set up, template sending is wired here.
    void data;
    return { configured: false as const, sent: [] as string[] };
  });
