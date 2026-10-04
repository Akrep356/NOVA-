const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "NOVA Music Server",
    status: "ok",
    endpoints: [
      "POST /generate",
      "POST /generate-lyrics"
    ]
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    stabilityKeyConfigured: Boolean(STABILITY_API_KEY),
    geminiKeyConfigured: Boolean(GEMINI_API_KEY)
  });
});


/*
 * EXISTING MUSIC GENERATION
 * Bu bölüm değiştirilmedi.
 */
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

    const audioBuffer = Buffer.from(
      await response.arrayBuffer()
    );

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="nova-generated.mp3"'
    );
    res.setHeader("Cache-Control", "no-store");

    return res.send(audioBuffer);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "NOVA music generation server error."
    });
  }
});


/*
 * GEMINI TÜRKÇE ŞARKI SÖZÜ OLUŞTURMA
 */
app.post("/generate-lyrics", async (req, res) => {
  try {

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured on the server."
      });
    }

    const topic = typeof req.body?.topic === "string"
      ? req.body.topic.trim()
      : "";

    if (!topic) {
      return res.status(400).json({
        error: "topic is required."
      });
    }

    if (topic.length > 2000) {
      return res.status(400).json({
        error: "topic is too long."
      });
    }


    const prompt = `
Sen NOVA adlı müzik uygulamasının profesyonel Türkçe şarkı sözü yazarısın.

Kullanıcının verdiği konu:

${topic}

Bu konuya uygun, tamamen Türkçe, doğal, duygusal ve müzikal bir şarkı sözü yaz.

KESİN KURALLAR:

- Sadece şarkı sözünü yaz.
- Açıklama yapma.
- "Tabii", "Elbette", "İşte", "Umarım beğenirsin" gibi girişler yazma.
- Şarkı sözü dışında hiçbir metin yazma.
- Düzyazı veya makale yazma.
- Şarkı sözleri anlamlı ve birbirine bağlı olsun.
- Türkçe dil bilgisi doğal olsun.
- Kafiyeler mümkün olduğunca doğal olsun.
- Aynı kelimeyi gereksiz yere tekrar etme.
- Yaklaşık 3-4 dakikalık bir şarkıya uygun uzunlukta yaz.
- Bölümleri açıkça belirt.

Şu yapıyı kullan:

[Kıta 1]
4-6 satır

[Ön Nakarat]
2-4 satır

[Nakarat]
4-6 satır

[Kıta 2]
4-6 satır

[Ön Nakarat]
2-4 satır

[Nakarat]
4-6 satır

[Köprü]
4-6 satır

[Final Nakarat]
4-6 satır

Sadece bu şarkı sözünü döndür.
`;


    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {
            maxOutputTokens: 3000
          }
        })
      }
    );


    const responseText = await response.text();


    if (!response.ok) {

      console.error(
        "Gemini API error:",
        responseText
      );

      return res.status(response.status).json({
        error: "Gemini lyrics generation failed.",
        details: responseText
      });
    }


    let data;

    try {

      data = JSON.parse(responseText);

    } catch (parseError) {

      console.error(
        "Gemini JSON parse error:",
        parseError
      );

      return res.status(500).json({
        error: "Invalid response received from Gemini."
      });
    }


    const lyrics = data?.candidates?.[0]?.content?.parts
      ?.map(part =>
        typeof part?.text === "string"
          ? part.text
          : ""
      )
      .join("")
      .trim();


    if (!lyrics) {

      return res.status(500).json({
        error: "Gemini did not return lyrics."
      });
    }


    return res.json({
      ok: true,
      lyrics: lyrics
    });


  } catch (error) {

    console.error(
      "Lyrics generation error:",
      error
    );

    return res.status(500).json({
      error: "NOVA lyrics generation server error."
    });
  }
});


app.listen(PORT, () => {

  console.log(
    `NOVA Music Server listening on port ${PORT}`
  );

});
