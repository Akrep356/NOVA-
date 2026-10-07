const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3000;

const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());

/*
 * WAN 2.2 için Android'den gönderilecek Base64 fotoğraf
 * 1 MB sınırına takılmasın diye 20 MB yapıldı.
 */
app.use(express.json({ limit: "20mb" }));

// =============================================================
// HUGGING FACE WAN 2.2
// =============================================================

const HF_WAN_SPACE =
  "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space";

const HF_TOKEN =
  process.env.HF_TOKEN || "";

function getHFHeaders(extraHeaders = {}) {

  const headers = {
    ...extraHeaders
  };

  if (HF_TOKEN) {

    headers["Authorization"] =
      `Bearer ${HF_TOKEN}`;

  }

  return headers;
}

// =============================================================
// HUGGING FACE WAN DOSYA YÜKLEME
// =============================================================

async function uploadImageToWan(
  imageBuffer,
  filename,
  mimeType
) {

  const form =
    new FormData();

  const blob =
    new Blob(
      [
        imageBuffer
      ],
      {
        type:
          mimeType ||
          "image/jpeg"
      }
    );

  form.append(
    "files",
    blob,
    filename || "nova-image.jpg"
  );

  const response =
    await fetch(
      `${HF_WAN_SPACE}/gradio_api/upload`,
      {
        method:
          "POST",

        headers:
          getHFHeaders(),

        body:
          form
      }
    );

  const responseText =
    await response.text();

  console.log(
    "WAN UPLOAD STATUS:",
    response.status
  );

  console.log(
    "WAN UPLOAD RESPONSE:",
    responseText
  );

  if (!response.ok) {

    throw new Error(
      `WAN image upload failed: ${response.status} ${responseText}`
    );
  }

  let data;

  try {

    data =
      JSON.parse(
        responseText
      );

  } catch (error) {

    throw new Error(
      "WAN upload returned invalid JSON."
    );
  }

  /*
   * Gradio çoğunlukla:
   *
   * [
   *   "/tmp/gradio/....jpg"
   * ]
   *
   * şeklinde döndürür.
   */

  let uploadedPath = "";

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {

    if (
      typeof data[0] === "string"
    ) {

      uploadedPath =
        data[0];

    } else if (
      data[0]?.path
    ) {

      uploadedPath =
        data[0].path;

    }

  } else if (
    typeof data === "string"
  ) {

    uploadedPath =
      data;

  } else if (
    data?.path
  ) {

    uploadedPath =
      data.path;

  }

  if (!uploadedPath) {

    throw new Error(
      "WAN upload did not return a file path."
    );
  }

  return uploadedPath;
}

// =============================================================
// WAN SONUÇ BEKLEME
// =============================================================

async function waitForWanResult(
  eventId
) {

  const url =
    `${HF_WAN_SPACE}/gradio_api/call/generate_video/${eventId}`;

  console.log(
    "WAN RESULT URL:",
    url
  );

  const response =
    await fetch(
      url,
      {
        method:
          "GET",

        headers:
          getHFHeaders({
            "Accept":
              "text/event-stream"
          })
      }
    );

  const responseText =
    await response.text();

  console.log(
    "WAN RESULT STATUS:",
    response.status
  );

  if (!response.ok) {

    throw new Error(
      `WAN result request failed: ${response.status} ${responseText}`
    );
  }

  /*
   * Gradio SSE cevabını bloklara ayırıyoruz.
   *
   * Örnek:
   *
   * event: generating
   * data: ...
   *
   * event: complete
   * data: [...]
   */

  const blocks =
    responseText
      .split(/\n\n+/)
      .map(
        block =>
          block.trim()
      )
      .filter(Boolean);

  let lastData =
    null;

  for (
    const block of blocks
  ) {

    const eventMatch =
      block.match(
        /(?:^|\n)event:\s*([^\n]+)/i
      );

    const dataMatch =
      block.match(
        /(?:^|\n)data:\s*([\s\S]*)/i
      );

    const eventName =
      eventMatch
        ? eventMatch[1].trim()
        : "";

    const dataText =
      dataMatch
        ? dataMatch[1].trim()
        : "";

    if (!dataText) {
      continue;
    }

    let parsedData;

    try {

      parsedData =
        JSON.parse(
          dataText
        );

    } catch (_) {

      parsedData =
        dataText;

    }

    lastData =
      parsedData;

    console.log(
      "WAN EVENT:",
      eventName
    );

    if (
      eventName === "error"
    ) {

      throw new Error(
        typeof parsedData === "string"
          ? parsedData
          : JSON.stringify(parsedData)
      );
    }

    if (
      eventName === "complete"
    ) {

      return parsedData;
    }
  }

  /*
   * Bazı Gradio sürümlerinde event ismi
   * farklı gelebilir. Son veri video
   * dosyasına benziyorsa onu da döndürüyoruz.
   */

  if (lastData !== null) {

    return lastData;

  }

  throw new Error(
    "WAN video generation returned no result."
  );
}

// =============================================================
// WAN SONUÇ İÇİNDEN VİDEO DOSYASINI BUL
// =============================================================

function findWanVideoFile(
  result
) {

  const found = [];

  function walk(
    value
  ) {

    if (
      value === null ||
      value === undefined
    ) {
      return;
    }

    if (
      typeof value === "string"
    ) {

      found.push(
        {
          value:
            value
        }
      );

      return;
    }

    if (
      Array.isArray(value)
    ) {

      for (
        const item of value
      ) {

        walk(
          item
        );

      }

      return;
    }

    if (
      typeof value === "object"
    ) {

      /*
       * Önce doğrudan FileData
       */

      if (
        typeof value.url === "string"
      ) {

        found.push(
          {
            value:
              value.url,

            type:
              "url"
          }
        );

      }

      if (
        typeof value.path === "string"
      ) {

        found.push(
          {
            value:
              value.path,

            type:
              "path"
          }
        );

      }

      if (
        typeof value.name === "string"
      ) {

        found.push(
          {
            value:
              value.name,

            type:
              "name"
          }
        );

      }

      for (
        const key of Object.keys(value)
      ) {

        walk(
          value[key]
        );

      }
    }
  }

  walk(
    result
  );

  /*
   * MP4 / WebM sonuçlarını önceliklendir.
   */

  const videoItem =
    found.find(
      item =>
        /\.(mp4|webm|mov|m4v)(\?|$)/i.test(
          String(
            item.value
          )
        )
    );

  if (
    videoItem
  ) {

    if (
      videoItem.type === "url"
    ) {

      return videoItem.value;

    }

    return buildWanFileUrl(
      videoItem.value
    );
  }

  /*
   * URL olarak gelen herhangi bir
   * video dosyasını kontrol et.
   */

  const urlItem =
    found.find(
      item =>
        item.type === "url"
    );

  if (
    urlItem
  ) {

    return urlItem.value;

  }

  /*
   * Path olarak gelen sonucu kullan.
   */

  const pathItem =
    found.find(
      item =>
        item.type === "path"
    );

  if (
    pathItem
  ) {

    return buildWanFileUrl(
      pathItem.value
    );

  }

  return null;
}

// =============================================================
// WAN DOSYA URL OLUŞTURMA
// =============================================================

function buildWanFileUrl(
  filePath
) {

  if (
    !filePath
  ) {

    return null;
  }

  if (
    /^https?:\/\//i.test(
      filePath
    )
  ) {

    return filePath;
  }

  return (
    `${HF_WAN_SPACE}/gradio_api/file=` +
    encodeURIComponent(
      filePath
    )
  );
}

// =============================================================
// WAN VİDEO İNDİRME
// =============================================================

async function downloadWanVideo(
  videoUrl
) {

  console.log(
    "WAN VIDEO DOWNLOAD URL:",
    videoUrl
  );

  const response =
    await fetch(
      videoUrl,
      {
        method:
          "GET",

        headers:
          getHFHeaders()
      }
    );

  if (!response.ok) {

    const errorText =
      await response.text();

    throw new Error(
      `WAN video download failed: ${response.status} ${errorText}`
    );
  }

  if (
    !response.body
  ) {

    throw new Error(
      "WAN video response has no body."
    );
  }

  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    );

  if (
    buffer.length <= 0
  ) {

    throw new Error(
      "WAN video is empty."
    );
  }

  return buffer;
}

// =============================================================
// WAN 2.2 VİDEO ÜRET
// =============================================================
//
// Android:
//
// POST /wan-video
//
// JSON:
//
// {
//   "imageBase64": "...",
//   "imageMimeType": "image/jpeg",
//   "prompt": "bu görüntüyü sinematik şekilde canlandır",
//   "duration": 3.5
// }
//
// =============================================================

app.post(
  "/wan-video",
  async (req, res) => {

    try {

      const imageBase64 =
        typeof req.body?.imageBase64 === "string"
          ? req.body.imageBase64
          : "";

      const imageMimeType =
        typeof req.body?.imageMimeType === "string"
          ? req.body.imageMimeType
          : "image/jpeg";

      const prompt =
        typeof req.body?.prompt === "string"
          ? req.body.prompt.trim()
          : "bu görüntüyü sinematik şekilde canlandır";

      const requestedDuration =
        Number(
          req.body?.duration ?? 3.5
        );

      if (
        !imageBase64
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "imageBase64 is required."
        });
      }

      /*
       * Base64 başında data:image/jpeg;base64,...
       * varsa temizle.
       */

      const cleanBase64 =
        imageBase64.replace(
          /^data:[^;]+;base64,/i,
          ""
        );

      let imageBuffer;

      try {

        imageBuffer =
          Buffer.from(
            cleanBase64,
            "base64"
          );

      } catch (decodeError) {

        return res.status(400).json({
          ok: false,
          error:
            "Invalid imageBase64."
        });
      }

      if (
        !imageBuffer ||
        imageBuffer.length <= 0
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "Image data is empty."
        });
      }

      /*
       * Güvenlik için 15 MB üstünü reddediyoruz.
       */

      const MAX_IMAGE_SIZE =
        15 * 1024 * 1024;

      if (
        imageBuffer.length >
        MAX_IMAGE_SIZE
      ) {

        return res.status(413).json({
          ok: false,
          error:
            "Image is too large. Maximum size is 15 MB."
        });
      }

      /*
       * Wan Space 0.5 - 5 saniye destekliyor.
       */

      const duration =
        Math.max(
          0.5,
          Math.min(
            5,
            requestedDuration
          )
        );

      console.log(
        "================================================="
      );

      console.log(
        "WAN 2.2 VIDEO REQUEST"
      );

      console.log(
        "Image size:",
        imageBuffer.length,
        "bytes"
      );

      console.log(
        "Image MIME:",
        imageMimeType
      );

      console.log(
        "Prompt:",
        prompt
      );

      console.log(
        "Duration:",
        duration
      );

      console.log(
        "================================================="
      );

      // ---------------------------------------------------------
      // 1. RESMİ WAN SPACE'E YÜKLE
      // ---------------------------------------------------------

      const filename =
        imageMimeType.includes("png")
          ? "nova-input.png"
          : "nova-input.jpg";

      const uploadedPath =
        await uploadImageToWan(
          imageBuffer,
          filename,
          imageMimeType
        );

      console.log(
        "WAN UPLOADED PATH:",
        uploadedPath
      );

      // ---------------------------------------------------------
      // 2. GRADIO FILEDATA
      // ---------------------------------------------------------

      const imageFileData = {

        path:
          uploadedPath,

        meta: {
          _type:
            "gradio.FileData"
        }
      };

      // ---------------------------------------------------------
      // 3. WAN GENERATE_VIDEO
      // ---------------------------------------------------------

      const wanData = [

        imageFileData,

        prompt,

        duration,

        "blurry, distorted face, deformed hands, extra fingers, duplicate person, bad anatomy, low quality",

        6,

        5,

        5,

        42,

        true

      ];

      console.log(
        "WAN CALL DATA PREPARED."
      );

      const generateResponse =
        await fetch(
          `${HF_WAN_SPACE}/gradio_api/call/generate_video`,
          {
            method:
              "POST",

            headers:
              getHFHeaders({
                "Content-Type":
                  "application/json"
              }),

            body:
              JSON.stringify({
                data:
                  wanData
              })
          }
        );

      const generateText =
        await generateResponse.text();

      console.log(
        "WAN GENERATE STATUS:",
        generateResponse.status
      );

      console.log(
        "WAN GENERATE RESPONSE:",
        generateText
      );

      if (
        !generateResponse.ok
      ) {

        return res.status(502).json({
          ok: false,

          error:
            "WAN video generation request failed.",

          details:
            generateText
        });
      }

      let generateData;

      try {

        generateData =
          JSON.parse(
            generateText
          );

      } catch (_) {

        return res.status(502).json({
          ok: false,

          error:
            "WAN returned invalid generation response.",

          details:
            generateText
        });
      }

      const eventId =
        generateData?.event_id;

      if (
        !eventId
      ) {

        return res.status(502).json({
          ok: false,

          error:
            "WAN did not return an event_id.",

          details:
            generateData
        });
      }

      console.log(
        "WAN EVENT ID:",
        eventId
      );

      // ---------------------------------------------------------
      // 4. VİDEONUN OLUŞMASINI BEKLE
      // ---------------------------------------------------------

      const result =
        await waitForWanResult(
          eventId
        );

      console.log(
        "WAN COMPLETE RESULT:"
      );

      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );

      // ---------------------------------------------------------
      // 5. VİDEO DOSYASINI BUL
      // ---------------------------------------------------------

      const videoUrl =
        findWanVideoFile(
          result
        );

      if (
        !videoUrl
      ) {

        return res.status(502).json({
          ok: false,

          error:
            "WAN completed but video file was not found.",

          result:
            result
        });
      }

      console.log(
        "WAN VIDEO URL:",
        videoUrl
      );

      // ---------------------------------------------------------
      // 6. MP4'Ü İNDİR
      // ---------------------------------------------------------

      const videoBuffer =
        await downloadWanVideo(
          videoUrl
        );

      console.log(
        "WAN VIDEO SIZE:",
        videoBuffer.length,
        "bytes"
      );

      // ---------------------------------------------------------
      // 7. ANDROID'A MP4 OLARAK GÖNDER
      // ---------------------------------------------------------

      res.setHeader(
        "Content-Type",
        "video/mp4"
      );

      res.setHeader(
        "Content-Disposition",
        'inline; filename="nova-wan-video.mp4"'
      );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      return res.send(
        videoBuffer
      );

    } catch (error) {

      console.error(
        "================================================="
      );

      console.error(
        "WAN VIDEO ERROR:"
      );

      console.error(
        error
      );

      console.error(
        "================================================="
      );

      return res.status(500).json({
        ok: false,

        error:
          "NOVA WAN video generation server error.",

        details:
          error?.message ||
          String(error)
      });
    }
  }
);

// =============================================================
// ANA SAYFA
// =============================================================

app.get("/", (_req, res) => {
  res.json({
    name: "NOVA Music Server",
    status: "ok",
    endpoints: [
      "POST /generate",
      "POST /generate-lyrics",
      "POST /prepare-video",
      "GET /wan-api-test",
      "POST /wan-video"
    ]
  });
});

// =============================================================
// HEALTH
// =============================================================

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    stabilityKeyConfigured:
      Boolean(STABILITY_API_KEY),
    geminiKeyConfigured:
      Boolean(GEMINI_API_KEY),
    hfTokenConfigured:
      Boolean(HF_TOKEN),
    videoEngine:
      "Wikimedia Commons + FFmpeg",
    wanEngine:
      "Hugging Face Wan 2.2 I2V"
  });
});

// =============================================================
// HUGGING FACE WAN 2.2 API TEST
// =============================================================
//
// Bu endpoint SADECE Hugging Face Wan Space API bilgisini
// kontrol eder.
//
// Video üretmez.
// ZeroGPU video süresi harcamaz.
// Mevcut video sistemine dokunmaz.
//
// =============================================================

app.get("/wan-api-test", async (_req, res) => {

  try {

    const response =
      await fetch(
        `${HF_WAN_SPACE}/gradio_api/info`
      );

    const responseText =
      await response.text();

    console.log(
      "WAN API TEST STATUS:",
      response.status
    );

    console.log(
      "WAN API TEST RESPONSE:",
      responseText
    );

    res
      .status(response.status)
      .type("application/json")
      .send(responseText);

  } catch (error) {

    console.error(
      "WAN API TEST ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message
    });
  }
});

// =============================================================
// MÜZİK OLUŞTURMA
// =============================================================

app.post("/generate", async (req, res) => {
  try {

    if (!STABILITY_API_KEY) {

      return res.status(500).json({
        error:
          "STABILITY_API_KEY is not configured on the server."
      });
    }

    const prompt =
      typeof req.body?.prompt === "string"
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

    const requestedDuration =
      Number(req.body?.duration ?? 30);

    const duration =
      Math.max(
        1,
        Math.min(
          190,
          requestedDuration
        )
      );

    const form =
      new FormData();

    form.append(
      "prompt",
      prompt
    );

    form.append(
      "output_format",
      "mp3"
    );

    form.append(
      "duration",
      String(duration)
    );

    form.append(
      "model",
      "stable-audio-2.5"
    );

    form.append(
      "steps",
      "8"
    );

    form.append(
      "cfg_scale",
      "1"
    );

    const response =
      await fetch(
        "https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio",
        {
          method: "POST",

          headers: {
            "authorization":
              `Bearer ${STABILITY_API_KEY}`,

            "accept":
              "audio/*",

            "stability-client-id":
              "NOVA",

            "stability-client-version":
              "1.0.0"
          },

          body: form
        }
      );

    if (!response.ok) {

      const errorText =
        await response.text();

      console.error(
        "STABLE AUDIO ERROR:",
        response.status,
        errorText
      );

      return res.status(
        response.status
      ).json({
        error:
          "Stable Audio request failed.",

        details:
          errorText
      });
    }

    const audioBuffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    res.setHeader(
      "Content-Type",
      "audio/mpeg"
    );

    res.setHeader(
      "Content-Disposition",
      'inline; filename="nova-generated.mp3"'
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.send(
      audioBuffer
    );

  } catch (error) {

    console.error(
      "Music generation error:",
      error
    );

    return res.status(500).json({
      error:
        "NOVA music generation server error."
    });
  }
});

// =============================================================
// GEMINI ŞARKI SÖZÜ
// =============================================================

app.post(
  "/generate-lyrics",
  async (req, res) => {

    try {

      if (!GEMINI_API_KEY) {

        return res.status(500).json({
          error:
            "GEMINI_API_KEY is not configured on the server."
        });
      }

      const topic =
        typeof req.body?.topic === "string"
          ? req.body.topic.trim()
          : "";

      if (!topic) {

        return res.status(400).json({
          error:
            "topic is required."
        });
      }

      if (topic.length > 2000) {

        return res.status(400).json({
          error:
            "topic is too long."
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

      const response =
        await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-goog-api-key":
                GEMINI_API_KEY
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
             
