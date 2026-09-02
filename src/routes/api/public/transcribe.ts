import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Transcription is not configured.", { status: 500 });

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size < 2048) {
          return new Response("That recording was empty — please try again.", { status: 400 });
        }
        if (file.size > 20 * 1024 * 1024) {
          return new Response("Recording is too long. Keep it under a couple of minutes.", { status: 400 });
        }

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-transcribe");
        upstream.append("file", file, "recording.wav");

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: upstream,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return new Response(body || `Transcription failed (${res.status})`, { status: res.status });
        }
        const json = (await res.json()) as { text?: string };
        return Response.json({ text: json.text ?? "" });
      },
    },
  },
});
