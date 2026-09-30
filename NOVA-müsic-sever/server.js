const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "NOVA Music Server",
    status: "ok",
    endpoint: "POST /generate"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    stabilityKeyConfigured: Boolean(STABILITY_API_KEY)
  });
});

app.post("/generate", async (req, res) => {
  try {
    if (!STABILITY_API_KEY) {
      return res.status(500).json({
        error: "STABILITY_API_KEY is not configured on the server."
      });
    }

    const prompt = typeof req.body?.prompt === "string"
      ? req.body.prompt.trim()
      : "";

    if (!prompt) {
      return res.status(400).json({
        error: "prompt is required."
      });
    }

    if (prompt.length > 10000) {
      return res.status(400).json({
        error: "prompt is too long."
      });
    }

    const requestedDuration = Number(req.body?.duration ?? 30);
    const duration = Math.max(1, Math.min(190, requestedDuration));

    const form = new FormData();
    form.append("prompt", prompt);
    form.append("output_format", "mp3");
    form.append("duration", String(duration));
    form.append("model", "stable-audio-2.5");
    form.append("steps", "8");
    form.append("cfg_scale", "1");

    const response = await fetch(
      "https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio",
      {
        method: "POST",
        headers: {
          "authorization": `Bearer ${STABILITY_API_KEY}`,
          "accept": "audio/*",
          "stability-client-id": "NOVA",
          "stability-client-version": "1.0.0"
        },
        body: form
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: "Stable Audio request failed.",
        details: errorText
      });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", 'inline; filename="nova-generated.mp3"');
    res.setHeader("Cache-Control", "no-store");
    return res.send(audioBuffer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "NOVA music generation server error."
    });
  }
});

app.listen(PORT, () => {
  console.log(`NOVA Music Server listening on port ${PORT}`);
});
