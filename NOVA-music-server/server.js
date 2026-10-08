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

const STABILITY_API_KEY =
  process.env.STABILITY_API_KEY;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;

const HF_WAN_SPACE =
  "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space";

const HF_TOKEN =
  process.env.HF_TOKEN || "";

app.use(cors());

app.use(
  express.json({
    limit: "20mb"
  })
);

// =============================================================
// HUGGING FACE HEADERS
// =============================================================

function getHFHeaders(extraHeaders = {}) {

  const headers = {
    ...extraHeaders
  };

  if (HF_TOKEN) {

    headers.Authorization =
      `Bearer ${HF_TOKEN}`;

  }

  return headers;
}

// =============================================================
// WAN IMAGE UPLOAD
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
      [imageBuffer],
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

  } catch (_) {

    throw new Error(
      "WAN upload returned invalid JSON."
    );
  }

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
// WAN RESULT
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
            Accept:
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

  console.log(
    "WAN RESULT RAW RESPONSE:",
    responseText
  );

  if (!response.ok) {

    throw new Error(
      `WAN result request failed: ${response.status} ${responseText}`
    );
  }

  const blocks =
    responseText
      .split(/\n\n+/)
      .map(
        block =>
          block.trim()
      )
      .filter(Boolean);

  let lastData = null;

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

    console.log(
      "WAN SSE BLOCK:",
      block
    );

    console.log(
      "WAN EVENT:",
      eventName
    );

    console.log(
      "WAN DATA:",
      dataText
    );

    if (!dataText) {

      if (
        eventName === "complete"
      ) {

        return null;

      }

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

    if (
      eventName === "error"
    ) {

      let errorMessage = "";

      if (
        typeof parsedData === "string"
      ) {

        errorMessage =
          parsedData;

      } else if (
        parsedData &&
        typeof parsedData === "object"
      ) {

        errorMessage =
          parsedData.message ||
          parsedData.error ||
          parsedData.detail ||
          JSON.stringify(
            parsedData
          );

      } else {

        errorMessage =
          "WAN returned an error event with no error details.";

      }

      throw new Error(
        `WAN generation error: ${errorMessage}`
      );
    }

    if (
      eventName === "complete"
    ) {

      return parsedData;
    }
  }

  if (lastData !== null) {

    return lastData;

  }

  throw new Error(
    "WAN video generation returned no result. Raw response: " +
    responseText
  );
}

// =============================================================
// WAN VIDEO FILE
// =============================================================

function buildWanFileUrl(
  filePath
) {

  if (!filePath) {
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

      found.push({
        value:
          value
      });

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

      if (
        typeof value.url === "string"
      ) {

        found.push({
          value:
            value.url,
          type:
            "url"
        });

      }

      if (
        typeof value.path === "string"
      ) {

        found.push({
          value:
            value.path,
          type:
            "path"
        });

      }

      if (
        typeof value.name === "string"
      ) {

        found.push({
          value:
            value.name,
          type:
            "name"
        });

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

  const videoItem =
    found.find(
      item =>
        /\.(mp4|webm|mov|m4v)(\?|$)/i.test(
          String(
            item.value
          )
        )
    );

  if (videoItem) {

    if (
      videoItem.type === "url"
    ) {

      return videoItem.value;

    }

    return buildWanFileUrl(
      videoItem.value
    );
  }

  const urlItem =
    found.find(
      item =>
        item.type === "url"
    );

  if (urlItem) {

    return urlItem.value;
  }

  const pathItem =
    found.find(
      item =>
        item.type === "path"
    );

  if (pathItem) {

    return buildWanFileUrl(
      pathItem.value
    );
  }

  return null;
}

// =============================================================
// WAN VIDEO DOWNLOAD
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
// WAN VIDEO
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

      if (!imageBase64) {

        return res.status(400).json({
          ok: false,
          error:
            "imageBase64 is required."
        });
      }

      const cleanBase64 =
        imageBase64.replace(
          /^data:[^;]+;base64,/i,
          ""
        );

      const imageBuffer =
        Buffer.from(
          cleanBase64,
          "base64"
        );

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
        imageBuffer.length
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

      const imageFileData = {
        path:
          uploadedPath,

        meta: {
          _type:
            "gradio.FileData"
        }
      };

      // =======================================================
      // WAN 2.2 GÜNCEL PARAMETRE SIRASI
      // =======================================================
      //
      // input_image
      // prompt
      // steps
      // negative_prompt
      // duration_seconds
      // guidance_scale
      // guidance_scale_2
      // seed
      // randomize_seed
      //
      // =======================================================

      const wanSteps =
        6;

      const wanNegativePrompt =
        "blurry, distorted face, deformed hands, extra fingers, duplicate person, bad anatomy, low quality";

      const wanGuidanceScale =
        1;

      const wanGuidanceScale2 =
        1;

      const wanSeed =
        42;

      const wanRandomizeSeed =
        true;

      const wanData = [

        imageFileData,

        prompt,

        wanSteps,

        wanNegativePrompt,

        duration,

        wanGuidanceScale,

        wanGuidanceScale2,

        wanSeed,

        wanRandomizeSeed

      ];

      console.log(
        "WAN DATA PARAMETER ORDER:"
      );

      console.log(
        JSON.stringify(
          {
            input_image:
              "[uploaded image]",

            prompt:
              prompt,

            steps:
              wanSteps,

            negative_prompt:
              wanNegativePrompt,

            duration_seconds:
              duration,

            guidance_scale:
              wanGuidanceScale,

            guidance_scale_2:
              wanGuidanceScale2,

            seed:
              wanSeed,

            randomize_seed:
              wanRandomizeSeed
          },
          null,
          2
        )
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

      if (!eventId) {

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

      const videoUrl =
        findWanVideoFile(
          result
        );

      if (!videoUrl) {

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

      const videoBuffer =
        await downloadWanVideo(
          videoUrl
        );

      console.log(
        "WAN VIDEO SIZE:",
        videoBuffer.length
      );

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
        "WAN VIDEO ERROR:",
        error
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

app.get(
  "/",
  (_req, res) => {

    res.json({
      name:
        "NOVA Music Server",

      status:
        "ok",

      endpoints: [
        "POST /generate",
        "POST /generate-lyrics",
        "POST /prepare-video",
        "GET /wan-api-test",
        "POST /wan-video"
      ]
    });

  }
);

// =============================================================
// HEALTH
// =============================================================

app.get(
  "/health",
  (_req, res) => {

    res.json({
      ok:
        true,

      stabilityKeyConfigured:
        Boolean(
          STABILITY_API_KEY
        ),

      geminiKeyConfigured:
        Boolean(
          GEMINI_API_KEY
        ),

      hfTokenConfigured:
        Boolean(
          HF_TOKEN
        ),

      videoEngine:
        "Wikimedia Commons + FFmpeg",

      wanEngine:
        "Hugging Face Wan 2.2 I2V"
    });

  }
);

// =============================================================
// WAN API TEST
// =============================================================

app.get(
  "/wan-api-test",
  async (_req, res) => {

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

      return res
        .status(
          response.status
        )
        .type(
          "application/json"
        )
        .send(
          responseText
        );

    } catch (error) {

      console.error(
        "WAN API TEST ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,

        error:
          error.message
      });
    }
  }
);

// =============================================================
// MÜZİK OLUŞTURMA
// =============================================================

app.post(
  "/generate",
  async (req, res) => {

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
          error:
            "prompt is required."
        });
      }

      if (
        prompt.length > 10000
      ) {

        return res.status(400).json({
          error:
            "prompt is too long."
        });
      }

      const requestedDuration =
        Number(
          req.body?.duration ?? 30
        );

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
            method:
              "POST",

            headers: {
              authorization:
                `Bearer ${STABILITY_API_KEY}`,

              accept:
                "audio/*",

              "stability-client-id":
                "NOVA",

              "stability-client-version":
                "1.0.0"
            },

            body:
              form
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

        return res
          .status(
            response.status
          )
          .json({
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
  }
);

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

      if (
        topic.length > 2000
      ) {

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
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-goog-api-key":
                GEMINI_API_KEY
            },

            body:
              JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text:
                          prompt
                      }
                    ]
                  }
                ],

                generationConfig: {
                  maxOutputTokens:
                    3000
                }
              })
          }
        );

      const responseText =
        await response.text();

      if (!response.ok) {

        console.error(
          "GEMINI ERROR:",
          response.status,
          responseText
        );

        return res
          .status(
            response.status
          )
          .json({
            error:
              "Gemini request failed.",

            details:
              responseText
          });
      }

      let data;

      try {

        data =
          JSON.parse(
            responseText
          );

      } catch (_) {

        return res.status(502).json({
          error:
            "Gemini returned invalid JSON.",

          details:
            responseText
        });
      }

      const lyrics =
        data
          ?.candidates?.[0]
          ?.content?.parts
          ?.map(
            part =>
              part?.text || ""
          )
          .join("")
          .trim();

      if (!lyrics) {

        return res.status(502).json({
          error:
            "Gemini returned empty lyrics.",

          details:
            data
        });
      }

      return res.json({
        ok:
          true,

        lyrics:
          lyrics
      });

    } catch (error) {

      console.error(
        "Lyrics generation error:",
        error
      );

      return res.status(500).json({
        error:
          "NOVA lyrics generation server error.",

        details:
          error?.message ||
          String(error)
      });
    }
  }
);

// =============================================================
// PREPARE VIDEO
// =============================================================

app.post(
  "/prepare-video",
  async (req, res) => {

    try {

      const lyrics =
        typeof req.body?.lyrics === "string"
          ? req.body.lyrics.trim()
          : "";

      const style =
        typeof req.body?.style === "string"
          ? req.body.style.trim()
          : "cinematic";

      const duration =
        Number(
          req.body?.duration ?? 30
        );

      const orientation =
        typeof req.body?.orientation === "string"
          ? req.body.orientation
          : "9:16";

      const visualDescription =
        typeof req.body?.visualDescription === "string"
          ? req.body.visualDescription.trim()
          : "";

      const safeDuration =
        Math.max(
          1,
          Math.min(
            190,
            duration
          )
        );

      return res.json({
        ok:
          true,

        status:
          "prepared",

        video: {

          lyrics:
            lyrics,

          style:
            style,

          duration:
            safeDuration,

          orientation:
            orientation,

          visualDescription:
            visualDescription,

          engine:
            "Wikimedia Commons + FFmpeg"
        }
      });

    } catch (error) {

      console.error(
        "Prepare video error:",
        error
      );

      return res.status(500).json({
        ok: false,

        error:
          "NOVA video preparation server error.",

        details:
          error?.message ||
          String(error)
      });
    }
  }
);

// =============================================================
// SERVER
// =============================================================

app.listen(
  PORT,
  () => {

    console.log(
      `NOVA Music Server listening on port ${PORT}`
    );

  }
);
