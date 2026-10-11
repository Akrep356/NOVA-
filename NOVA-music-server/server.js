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
    limit: "100mb"
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
    headers.Authorization = `Bearer ${HF_TOKEN}`;
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
  const form = new FormData();

  const blob = new Blob(
    [imageBuffer],
    {
      type: mimeType || "image/jpeg"
    }
  );

  form.append(
    "files",
    blob,
    filename || "nova-image.jpg"
  );

  const response = await fetch(
    `${HF_WAN_SPACE}/gradio_api/upload`,
    {
      method: "POST",
      headers: getHFHeaders(),
      body: form
    }
  );

  const responseText = await response.text();

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
    data = JSON.parse(responseText);
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
    if (typeof data[0] === "string") {
      uploadedPath = data[0];
    } else if (data[0]?.path) {
      uploadedPath = data[0].path;
    }
  } else if (typeof data === "string") {
    uploadedPath = data;
  } else if (data?.path) {
    uploadedPath = data.path;
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

async function waitForWanResult(eventId) {
  const url =
    `${HF_WAN_SPACE}/gradio_api/call/generate_video/${eventId}`;

  console.log("WAN RESULT URL:", url);

  const response = await fetch(
    url,
    {
      method: "GET",
      headers: getHFHeaders({
        Accept: "text/event-stream"
      })
    }
  );

  const responseText = await response.text();

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

  const blocks = responseText
    .split(/\n\n+/)
    .map(block => block.trim())
    .filter(Boolean);

  let lastData = null;

  for (const block of blocks) {
    const eventMatch = block.match(
      /(?:^|\n)event:\s*([^\n]+)/i
    );

    const dataMatch = block.match(
      /(?:^|\n)data:\s*([\s\S]*)/i
    );

    const eventName = eventMatch
      ? eventMatch[1].trim()
      : "";

    const dataText = dataMatch
      ? dataMatch[1].trim()
      : "";

    console.log("WAN SSE BLOCK:", block);
    console.log("WAN EVENT:", eventName);
    console.log("WAN DATA:", dataText);

    if (!dataText) {
      if (eventName === "complete") {
        return null;
      }

      continue;
    }

    let parsedData;

    try {
      parsedData = JSON.parse(dataText);
    } catch (_) {
      parsedData = dataText;
    }

    lastData = parsedData;

    if (eventName === "error") {
      let errorMessage = "";

      if (typeof parsedData === "string") {
        errorMessage = parsedData;
      } else if (
        parsedData &&
        typeof parsedData === "object"
      ) {
        errorMessage =
          parsedData.message ||
          parsedData.error ||
          parsedData.detail ||
          JSON.stringify(parsedData);
      } else {
        errorMessage =
          "WAN returned an error event with no error details.";
      }

      throw new Error(
        `WAN generation error: ${errorMessage}`
      );
    }

    if (eventName === "complete") {
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

function buildWanFileUrl(filePath) {
  if (!filePath) {
    return null;
  }

  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }

  return (
    `${HF_WAN_SPACE}/gradio_api/file=` +
    encodeURIComponent(filePath)
  );
}

function findWanVideoFile(result) {
  const found = [];

  function walk(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return;
    }

    if (typeof value === "string") {
      found.push({
        value
      });

      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }

      return;
    }

    if (typeof value === "object") {
      if (typeof value.url === "string") {
        found.push({
          value: value.url,
          type: "url"
        });
      }

      if (typeof value.path === "string") {
        found.push({
          value: value.path,
          type: "path"
        });
      }

      if (typeof value.name === "string") {
        found.push({
          value: value.name,
          type: "name"
        });
      }

      for (const key of Object.keys(value)) {
        walk(value[key]);
      }
    }
  }

  walk(result);

  const videoItem = found.find(
    item =>
      /\.(mp4|webm|mov|m4v)(\?|$)/i.test(
        String(item.value)
      )
  );

  if (videoItem) {
    if (videoItem.type === "url") {
      return videoItem.value;
    }

    return buildWanFileUrl(videoItem.value);
  }

  const urlItem = found.find(
    item => item.type === "url"
  );

  if (urlItem) {
    return urlItem.value;
  }

  const pathItem = found.find(
    item => item.type === "path"
  );

  if (pathItem) {
    return buildWanFileUrl(pathItem.value);
  }

  return null;
}

// =============================================================
// WAN VIDEO DOWNLOAD
// =============================================================

async function downloadWanVideo(videoUrl) {
  console.log(
    "WAN VIDEO DOWNLOAD URL:",
    videoUrl
  );

  const response = await fetch(
    videoUrl,
    {
      method: "GET",
      headers: getHFHeaders()
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `WAN video download failed: ${response.status} ${errorText}`
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  if (buffer.length <= 0) {
    throw new Error("WAN video is empty.");
  }

  return buffer;
}

// =============================================================
// WAN 2.2 VIDEO
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

      const requestedDuration = Number(
        req.body?.duration ?? 3.5
      );

      if (!imageBase64) {
        return res.status(400).json({
          ok: false,
          error: "imageBase64 is required."
        });
      }

      const cleanBase64 = imageBase64.replace(
        /^data:[^;]+;base64,/i,
        ""
      );

      const imageBuffer = Buffer.from(
        cleanBase64,
        "base64"
      );

      if (
        !imageBuffer ||
        imageBuffer.length <= 0
      ) {
        return res.status(400).json({
          ok: false,
          error: "Image data is empty."
        });
      }

      const MAX_IMAGE_SIZE =
        15 * 1024 * 1024;

      if (imageBuffer.length > MAX_IMAGE_SIZE) {
        return res.status(413).json({
          ok: false,
          error:
            "Image is too large. Maximum size is 15 MB."
        });
      }

      const duration = Math.max(
        0.5,
        Math.min(5, requestedDuration)
      );

      console.log(
        "================================================="
      );

      console.log("WAN 2.2 VIDEO REQUEST");
      console.log("Image size:", imageBuffer.length);
      console.log("Prompt:", prompt);
      console.log("Duration:", duration);

      console.log(
        "================================================="
      );

      const filename = imageMimeType.includes("png")
        ? "nova-input.png"
        : "nova-input.jpg";

      const uploadedPath = await uploadImageToWan(
        imageBuffer,
        filename,
        imageMimeType
      );

      console.log(
        "WAN UPLOADED PATH:",
        uploadedPath
      );

      const imageFileData = {
        path: uploadedPath,
        orig_name: filename,
        size: imageBuffer.length,
        mime_type: imageMimeType,
        is_stream: false,
        meta: {
          _type: "gradio.FileData"
        }
      };

      const wanSteps = 6;

      const wanNegativePrompt =
        "blurry, distorted face, deformed hands, extra fingers, duplicate person, bad anatomy, low quality";

      const wanGuidanceScale = 1;
      const wanGuidanceScale2 = 1;
      const wanSeed = 42;
      const wanRandomizeSeed = true;

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
            input_image: "[uploaded image]",
            prompt,
            steps: wanSteps,
            negative_prompt: wanNegativePrompt,
            duration_seconds: duration,
            guidance_scale: wanGuidanceScale,
            guidance_scale_2: wanGuidanceScale2,
            seed: wanSeed,
            randomize_seed: wanRandomizeSeed
          },
          null,
          2
        )
      );

      const generateResponse = await fetch(
        `${HF_WAN_SPACE}/gradio_api/call/generate_video`,
        {
          method: "POST",
          headers: getHFHeaders({
            "Content-Type": "application/json"
          }),
          body: JSON.stringify({
            data: wanData
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

      if (!generateResponse.ok) {
        return res.status(502).json({
          ok: false,
          error:
            "WAN video generation request failed.",
          details: generateText
        });
      }

      let generateData;

      try {
        generateData = JSON.parse(generateText);
      } catch (_) {
        return res.status(502).json({
          ok: false,
          error:
            "WAN returned invalid generation response.",
          details: generateText
        });
      }

      const eventId = generateData?.event_id;

      if (!eventId) {
        return res.status(502).json({
          ok: false,
          error: "WAN did not return an event_id.",
          details: generateData
        });
      }

      console.log("WAN EVENT ID:", eventId);

      const result = await waitForWanResult(eventId);

      console.log("WAN COMPLETE RESULT:");

      console.log(
        JSON.stringify(result, null, 2)
      );

      const videoUrl = findWanVideoFile(result);

      if (!videoUrl) {
        return res.status(502).json({
          ok: false,
          error:
            "WAN completed but video file was not found.",
          result
        });
      }

      console.log("WAN VIDEO URL:", videoUrl);

      const videoBuffer = await downloadWanVideo(
        videoUrl
      );

      console.log(
        "WAN VIDEO SIZE:",
        videoBuffer.length
      );

      res.setHeader("Content-Type", "video/mp4");

      res.setHeader(
        "Content-Disposition",
        'inline; filename="nova-wan-video.mp4"'
      );

      res.setHeader("Cache-Control", "no-store");

      return res.send(videoBuffer);

    } catch (error) {
      console.error("WAN VIDEO ERROR:", error);

      return res.status(500).json({
        ok: false,
        error:
          "NOVA WAN video generation server error.",
        details:
          error?.message || String(error)
      });
    }
  }
);

// =============================================================
// VIDEO + AUDIO MERGE
// =============================================================

app.post(
  "/merge-video-audio",
  async (req, res) => {
    let tempDir = null;

    try {
      const videoBase64 =
        typeof req.body?.videoBase64 === "string"
          ? req.body.videoBase64
          : "";

      const audioBase64 =
        typeof req.body?.audioBase64 === "string"
          ? req.body.audioBase64
          : "";

      const videoMimeType =
        typeof req.body?.videoMimeType === "string"
          ? req.body.videoMimeType
          : "video/mp4";

      const audioMimeType =
        typeof req.body?.audioMimeType === "string"
          ? req.body.audioMimeType
          : "audio/mpeg";

      if (!videoBase64) {
        return res.status(400).json({
          ok: false,
          error: "videoBase64 is required."
        });
      }

      if (!audioBase64) {
        return res.status(400).json({
          ok: false,
          error: "audioBase64 is required."
        });
      }

      console.log(
        "================================================="
      );

      console.log("NOVA VIDEO + AUDIO MERGE");
      console.log("Video MIME:", videoMimeType);
      console.log("Audio MIME:", audioMimeType);
      console.log("Video Base64 size:", videoBase64.length);
      console.log("Audio Base64 size:", audioBase64.length);

      console.log(
        "================================================="
      );

      const cleanVideoBase64 = videoBase64.replace(
        /^data:[^;]+;base64,/i,
        ""
      );

      const cleanAudioBase64 = audioBase64.replace(
        /^data:[^;]+;base64,/i,
        ""
      );

      const videoBuffer = Buffer.from(
        cleanVideoBase64,
        "base64"
      );

      const audioBuffer = Buffer.from(
        cleanAudioBase64,
        "base64"
      );

      if (videoBuffer.length <= 0) {
        return res.status(400).json({
          ok: false,
          error: "Video data is empty."
        });
      }

      if (audioBuffer.length <= 0) {
        return res.status(400).json({
          ok: false,
          error: "Audio data is empty."
        });
      }

      const MAX_VIDEO_SIZE =
        50 * 1024 * 1024;

      const MAX_AUDIO_SIZE =
        30 * 1024 * 1024;

      if (videoBuffer.length > MAX_VIDEO_SIZE) {
        return res.status(413).json({
          ok: false,
          error:
            "Video is too large. Maximum size is 50 MB."
        });
      }

      if (audioBuffer.length > MAX_AUDIO_SIZE) {
        return res.status(413).json({
          ok: false,
          error:
            "Audio is too large. Maximum size is 30 MB."
        });
      }

      tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "nova-merge-")
      );

      const inputVideo = path.join(
        tempDir,
        "input-video.mp4"
      );

      const inputAudio = path.join(
        tempDir,
        "input-audio.mp3"
      );

      const outputVideo = path.join(
        tempDir,
        "output-video.mp4"
      );

      fs.writeFileSync(inputVideo, videoBuffer);
      fs.writeFileSync(inputAudio, audioBuffer);

      console.log("FFmpeg input video:", inputVideo);
      console.log("FFmpeg input audio:", inputAudio);

      const ffmpegArgs = [
        "-y",
        "-stream_loop", "-1",
        "-i", inputVideo,
        "-i", inputAudio,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "44100",
        "-shortest",
        "-movflags", "+faststart",
        outputVideo
      ];

      console.log("FFmpeg command:");
      console.log("ffmpeg " + ffmpegArgs.join(" "));

      const ffmpegResult = await execFileAsync(
        "ffmpeg",
        ffmpegArgs,
        {
          maxBuffer: 20 * 1024 * 1024
        }
      );

      if (ffmpegResult?.stdout) {
        console.log(
          "FFmpeg STDOUT:",
          ffmpegResult.stdout
        );
      }

      if (ffmpegResult?.stderr) {
        console.log(
          "FFmpeg STDERR:",
          ffmpegResult.stderr
        );
      }

      if (!fs.existsSync(outputVideo)) {
        throw new Error(
          "FFmpeg output video was not created."
        );
      }

      const outputStats = fs.statSync(outputVideo);

      if (outputStats.size <= 0) {
        throw new Error(
          "FFmpeg created an empty video."
        );
      }

      console.log(
        "FINAL VIDEO SIZE:",
        outputStats.size
      );

      res.setHeader("Content-Type", "video/mp4");

      res.setHeader(
        "Content-Disposition",
        'inline; filename="nova-music-video.mp4"'
      );

      res.setHeader("Cache-Control", "no-store");

      const outputStream = fs.createReadStream(
        outputVideo
      );

      outputStream.on("error", error => {
        console.error(
          "FINAL VIDEO STREAM ERROR:",
          error
        );

        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error: "Final video stream failed.",
            details: error.message
          });
        }
      });

      outputStream.on("close", () => {
        console.log("FINAL VIDEO STREAM CLOSED");

        try {
          if (
            tempDir &&
            fs.existsSync(tempDir)
          ) {
            fs.rmSync(
              tempDir,
              {
                recursive: true,
                force: true
              }
            );

            console.log(
              "Temporary merge files deleted."
            );
          }
        } catch (cleanupError) {
          console.error(
            "Cleanup error:",
            cleanupError
          );
        }
      });

      return outputStream.pipe(res);

    } catch (error) {
      console.error(
        "VIDEO + AUDIO MERGE ERROR:",
        error
      );

      try {
        if (
          tempDir &&
          fs.existsSync(tempDir)
        ) {
          fs.rmSync(
            tempDir,
            {
              recursive: true,
              force: true
            }
          );
        }
      } catch (cleanupError) {
        console.error(
          "Merge cleanup error:",
          cleanupError
        );
      }

      return res.status(500).json({
        ok: false,
        error:
          "NOVA video + audio merge server error.",
        details:
          error?.message || String(error)
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
      "POST /wan-video",
      "POST /merge-video-audio"
    ]
  });
});

// =============================================================
// HEALTH
// =============================================================

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    stabilityKeyConfigured: Boolean(STABILITY_API_KEY),
    geminiKeyConfigured: Boolean(GEMINI_API_KEY),
    hfTokenConfigured: Boolean(HF_TOKEN),
    videoEngine: "Wikimedia Commons + FFmpeg",
    wanEngine: "Hugging Face Wan 2.2 I2V",
    mergeEngine: "FFmpeg"
  });
});

// =============================================================
// WAN API TEST
// =============================================================

app.get(
  "/wan-api-test",
  async (_req, res) => {
    try {
      const response = await fetch(
        `${HF_WAN_SPACE}/gradio_api/info`
      );

      const responseText = await response.text();

      console.log(
        "WAN API TEST STATUS:",
        response.status
      );

      console.log(
        "WAN API TEST RESPONSE:",
        responseText
      );

      return res
        .status(response.status)
        .type("application/json")
        .send(responseText);

    } catch (error) {
      console.error(
        "WAN API TEST ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: error.message
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
          error: "prompt is required."
        });
      }

      if (prompt.length > 10000) {
        return res.status(400).json({
          error: "prompt is too long."
        });
      }

      const requestedDuration = Number(
        req.body?.duration ?? 30
      );

      const duration = Math.max(
        1,
        Math.min(190, requestedDuration)
      );

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
            authorization:
              `Bearer ${STABILITY_API_KEY}`,
            accept: "audio/*",
            "stability-client-id": "NOVA",
            "stability-client-version": "1.0.0"
          },
          body: form
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          "STABLE AUDIO ERROR:",
          response.status,
          errorText
        );

        return res
          .status(response.status)
          .json({
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
          "GEMINI ERROR:",
          response.status,
          responseText
        );

        return res
          .status(response.status)
          .json({
            error: "Gemini request failed.",
            details: responseText
          });
      }

      let data;

      try {
        data = JSON.parse(responseText);
      } catch (_) {
        return res.status(502).json({
          error: "Gemini returned invalid JSON.",
          details: responseText
        });
      }

      const lyrics = data
        ?.candidates?.[0]
        ?.content?.parts
        ?.map(part => part?.text || "")
        .join("")
        .trim();

      if (!lyrics) {
        return res.status(502).json({
          error: "Gemini returned empty lyrics.",
          details: data
        });
      }

      return res.json({
        ok: true,
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
          error?.message || String(error)
      });
    }
  }
);

// =============================================================
// PREPARE VIDEO - GELİŞTİRİLMİŞ WIKIMEDIA ARAMASI + GERÇEK MP4
// =============================================================

app.post(
  "/prepare-video",
  async (req, res) => {
    let tempDir = null;

    try {
      console.log("========================================");
      console.log("NOVA PREPARE VIDEO REQUEST STARTED");
      console.log("Request body fields:", Object.keys(req.body || {}));

      const lyrics =
        typeof req.body?.lyrics === "string"
          ? req.body.lyrics.trim()
          : "";

      const style =
        typeof req.body?.style === "string"
          ? req.body.style.trim()
          : "Sinematik";

      const visualDescription =
        typeof req.body?.visualDescription === "string"
          ? req.body.visualDescription.trim()
          : "";

      const duration = Math.max(
        1,
        Math.min(
          180,
          Number(req.body?.duration) || 30
        )
      );

      const orientation = [
        "9:16",
        "16:9",
        "1:1"
      ].includes(req.body?.orientation)
        ? req.body.orientation
        : "9:16";

      if (!lyrics) {
        return res.status(400).json({
          ok: false,
          error: "Şarkı sözleri gerekli."
        });
      }

      const styleMap = {
        "Sinematik": [
          "cinematic landscape",
          "film landscape"
        ],
        "Duygusal": [
          "sunset landscape",
          "ocean sunset"
        ],
        "Enerjik": [
          "dance festival",
          "city lights"
        ],
        "Romantik": [
          "romantic sunset",
          "couple nature"
        ],
        "Karanlık": [
          "dark dramatic",
          "storm clouds"
        ],
        "Neon": [
          "neon city",
          "night city"
        ],
        "Doğa": [
          "nature landscape",
          "mountains forest"
        ],
        "Konser": [
          "live concert",
          "concert crowd"
        ]
      };

      const cleanQuery = value =>
        String(value || "")
          .replace(/[^\p{L}\p{N}\s-]/gu, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);

      const styleKeywords =
        styleMap[style] || [
          cleanQuery(style) || "cinematic landscape",
          "nature landscape"
        ];

      const visualKeyword = cleanQuery(
        visualDescription
      );

      const queries = [];

      if (visualKeyword) {
        queries.push(visualKeyword);
        queries.push(`${visualKeyword} landscape`);
        queries.push(`${visualKeyword} ${styleKeywords[0]}`);
      }

      for (const keyword of styleKeywords) {
        queries.push(keyword);
      }

      queries.push(
        "nature landscape",
        "ocean waves",
        "forest landscape",
        "clouds timelapse",
        "mountain landscape",
        "city skyline",
        "sunset landscape",
        "waterfall nature",
        "river landscape",
        "night sky stars"
      );

      const uniqueQueries = [
        ...new Set(
          queries
            .map(cleanQuery)
            .filter(Boolean)
        )
      ];

      tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "nova-video-")
      );

      const maxSourceBytes =
        80 * 1024 * 1024;

      const sources = [];
      const seen = new Set();

      // -------------------------------------------------------
      // WIKIMEDIA COMMONS ARAMA
      //
      // ÖNEMLİ DÜZELTME:
      // filetype:video filtresi kaldırıldı.
      // Arama önce genel dosya adları ve metin üzerinde yapılıyor.
      // Ardından API'den dönen dosyanın gerçekten video olup
      // olmadığı kontrol ediliyor.
      // -------------------------------------------------------

      async function searchVideos(query) {
        console.log(
          "WIKIMEDIA ARAMA:",
          query
        );

        const searchParams = new URLSearchParams({
          action: "query",
          list: "search",
          srsearch: query,
          srnamespace: "6",
          srlimit: "30",
          srwhat: "text",
          format: "json",
          formatversion: "2"
        });

        const searchUrl =
          "https://commons.wikimedia.org/w/api.php?" +
          searchParams.toString();

        const searchResponse = await fetch(
          searchUrl,
          {
            headers: {
              "User-Agent":
                "NOVA-Music-Video/1.0 (video generation application)",
              "Accept": "application/json"
            },
            signal: AbortSignal.timeout(25000)
          }
        );

        if (!searchResponse.ok) {
          const errorText = await searchResponse.text();

          throw new Error(
            `Wikimedia arama HTTP ${searchResponse.status}: ${errorText.slice(0, 500)}`
          );
        }

        const searchData = await searchResponse.json();

        if (searchData?.error) {
          throw new Error(
            "Wikimedia API arama hatası: " +
            JSON.stringify(searchData.error)
          );
        }

        const results =
          searchData?.query?.search || [];

        console.log(
          "WIKIMEDIA ARAMA SONUÇ SAYISI:",
          query,
          results.length
        );

        if (!results.length) {
          console.log(
            "Arama sonucu yok:",
            query
          );

          return;
        }

        const pageIds = results
          .map(item => Number(item.pageid))
          .filter(Number.isFinite);

        if (!pageIds.length) {
          console.log(
            "Wikimedia sonuçlarında geçerli pageid yok:",
            query
          );

          return;
        }

        const infoParams = new URLSearchParams({
          action: "query",
          pageids: pageIds.join("|"),
          prop: "imageinfo",
          iiprop: "url|mime|size|mediatype",
          format: "json",
          formatversion: "2"
        });

        const infoResponse = await fetch(
          "https://commons.wikimedia.org/w/api.php?" +
            infoParams.toString(),
          {
            headers: {
              "User-Agent":
                "NOVA-Music-Video/1.0 (video generation application)",
              "Accept": "application/json"
            },
            signal: AbortSignal.timeout(25000)
          }
        );

        if (!infoResponse.ok) {
          const errorText = await infoResponse.text();

          throw new Error(
            `Wikimedia dosya bilgisi HTTP ${infoResponse.status}: ${errorText.slice(0, 500)}`
          );
        }

        const infoData = await infoResponse.json();

        if (infoData?.error) {
          throw new Error(
            "Wikimedia API dosya bilgisi hatası: " +
            JSON.stringify(infoData.error)
          );
        }

        const pages = infoData?.query?.pages || [];

        console.log(
          "WIKIMEDIA DOSYA BİLGİSİ SAYISI:",
          pages.length
        );

        for (const page of pages) {
          const info = page?.imageinfo?.[0];

          if (!info?.url) {
            console.log(
              "Dosyanın indirme URL'si yok:",
              page?.title
            );

            continue;
          }

          const url = info.url;
          const mime = info.mime || "";
          const title = page.title || "";
          const mediaType = info.mediatype || "";

          const isVideo =
            mediaType === "VIDEO" ||
            /^video\//i.test(mime) ||
            /\.(mp4|webm|ogv|mov|m4v)(?:$|[?#])/i.test(url) ||
            /\.(mp4|webm|ogv|mov|m4v)$/i.test(title);

          if (!isVideo) {
            continue;
          }

          const size = Number(info.size);

          if (
            !Number.isFinite(size) ||
            size <= 0 ||
            size > maxSourceBytes
          ) {
            console.log(
              "Video boyutu uygun değil:",
              title,
              size
            );

            continue;
          }

          if (seen.has(url)) {
            continue;
          }

          seen.add(url);

          sources.push({
            url,
            mime,
            size,
            title
          });

          console.log(
            "VIDEO KAYNAĞI BULUNDU:",
            title,
            size,
            mime
          );
        }
      }

      // -------------------------------------------------------
      // VİDEO İNDİRME VE DOSYA KONTROLÜ
      // -------------------------------------------------------

      async function downloadSource(source) {
        console.log(
          "VIDEO İNDİRİLİYOR:",
          source.title,
          source.url
        );

        const response = await fetch(
          source.url,
          {
            headers: {
              "User-Agent":
                "NOVA-Music-Video/1.0 (video generation application)"
            },
            signal: AbortSignal.timeout(60000)
          }
        );

        if (!response.ok) {
          throw new Error(
            `Video indirilemedi: HTTP ${response.status}`
          );
        }

        const contentType =
          response.headers.get("content-type") || "";

        if (
          contentType.includes("text/html") ||
          contentType.includes("application/json")
        ) {
          throw new Error(
            "Kaynak video yerine HTML veya JSON döndü."
          );
        }

        const buffer = Buffer.from(
          await response.arrayBuffer()
        );

        if (
          buffer.length === 0 ||
          buffer.length > maxSourceBytes
        ) {
          throw new Error(
            "Kaynak video boş veya 80 MB sınırını aşıyor."
          );
        }

        const header = buffer
          .subarray(0, 16)
          .toString("ascii");

        const looksLikeMp4 =
          buffer.length >= 12 &&
          buffer.subarray(4, 8).toString("ascii") === "ftyp";

        const looksLikeWebm =
          buffer.length >= 4 &&
          buffer.subarray(0, 4).equals(
            Buffer.from([
              0x1a,
              0x45,
              0xdf,
              0xa3
            ])
          );

        const looksLikeOgg =
          header.startsWith("OggS");

        if (
          !looksLikeMp4 &&
          !looksLikeWebm &&
          !looksLikeOgg
        ) {
          console.log(
            "Kaynak dosya başlığı:",
            header
          );

          throw new Error(
            "İndirilen dosya geçerli MP4, WebM veya Ogg videosu gibi görünmüyor."
          );
        }

        console.log(
          "VIDEO İNDİRİLDİ:",
          source.title,
          buffer.length
        );

        return buffer;
      }

      // -------------------------------------------------------
      // ÇIKTI BOYUTU
      // -------------------------------------------------------

      let width;
      let height;

      if (orientation === "16:9") {
        width = 1280;
        height = 720;
      } else if (orientation === "1:1") {
        width = 720;
        height = 720;
      } else {
        width = 720;
        height = 1280;
      }

      const scaleFilter =
        `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1`;

      // -------------------------------------------------------
      // ARAMALARI DENE
      // -------------------------------------------------------

      console.log(
        "TOPLAM WIKIMEDIA SORGUSU:",
        uniqueQueries.length
      );

      for (const query of uniqueQueries) {
        if (sources.length >= 20) {
          break;
        }

        try {
          await searchVideos(query);
        } catch (searchError) {
          console.error(
            "WIKIMEDIA ARAMA HATASI:",
            query,
            searchError?.message || String(searchError)
          );
        }
      }

      console.log(
        "WIKIMEDIA ARAMALARI TAMAMLANDI. KAYNAK SAYISI:",
        sources.length
      );

      if (sources.length === 0) {
        throw new Error(
          "Wikimedia Commons aramalarında uygun video bulunamadı. " +
          "WIKIMEDIA ARAMA ve WIKIMEDIA ARAMA HATASI günlüklerini kontrol et."
        );
      }

      console.log(
        "TOPLAM VİDEO KAYNAĞI:",
        sources.length
      );

      // -------------------------------------------------------
      // VİDEO SEGMENTLERİNİ OLUŞTUR
      // -------------------------------------------------------

      const segmentFiles = [];
      let remaining = duration;
      let segmentIndex = 0;

      for (
        let i = 0;
        i < sources.length && remaining > 0.01;
        i++
      ) {
        const source = sources[i];

        const segmentDuration = Math.min(
          10,
          remaining
        );

        const inputFile = path.join(
          tempDir,
          `source-${i}.video`
        );

        const segmentFile = path.join(
          tempDir,
          `segment-${i}.mp4`
        );

        try {
          const sourceBuffer = await downloadSource(
            source
          );

          fs.writeFileSync(
            inputFile,
            sourceBuffer
          );

          await execFileAsync(
            "ffmpeg",
            [
              "-y",
              "-stream_loop", "-1",
              "-i", inputFile,
              "-t", String(segmentDuration),
              "-vf", scaleFilter,
              "-r", "24",
              "-an",
              "-c:v", "libx264",
              "-preset", "veryfast",
              "-crf", "28",
              "-pix_fmt", "yuv420p",
              "-movflags", "+faststart",
              segmentFile
            ],
            {
              timeout: 180000,
              maxBuffer: 20 * 1024 * 1024
            }
          );

          if (
            !fs.existsSync(segmentFile) ||
            fs.statSync(segmentFile).size === 0
          ) {
            throw new Error(
              "FFmpeg boş video segmenti oluşturdu."
            );
          }

          segmentFiles.push(segmentFile);

          remaining -= segmentDuration;
          segmentIndex++;

          console.log(
            "VIDEO SEGMENT HAZIR:",
            segmentIndex,
            "Süre:",
            segmentDuration
          );

        } catch (segmentError) {
          console.error(
            "VIDEO SEGMENT HATASI:",
            source.title,
            segmentError?.message || String(segmentError)
          );
        }
      }

      if (
        segmentFiles.length === 0 ||
        remaining > 0.01
      ) {
        throw new Error(
          "İstenen video süresi tamamlanamadı. " +
          `Oluşturulan segment: ${segmentIndex}, ` +
          `kalan süre: ${remaining.toFixed(1)} saniye. ` +
          "Kaynak videoları veya Render üzerindeki FFmpeg kurulumunu kontrol et."
        );
      }

      // -------------------------------------------------------
      // SEGMENTLERİ BİRLEŞTİR
      // -------------------------------------------------------

      const concatFile = path.join(
        tempDir,
        "concat.txt"
      );

      const outputFile = path.join(
        tempDir,
        "nova-video.mp4"
      );

      const concatText = segmentFiles
        .map(file =>
          "file '" +
          file.replace(/'/g, "'\\''") +
          "'"
        )
        .join("\n");

      fs.writeFileSync(
        concatFile,
        concatText,
        "utf8"
      );

      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-f", "concat",
          "-safe", "0",
          "-i", concatFile,
          "-t", String(duration),
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "28",
          "-pix_fmt", "yuv420p",
          "-an",
          "-movflags", "+faststart",
          outputFile
        ],
        {
          timeout: 240000,
          maxBuffer: 20 * 1024 * 1024
        }
      );

      if (
        !fs.existsSync(outputFile) ||
        fs.statSync(outputFile).size === 0
      ) {
        throw new Error(
          "FFmpeg son MP4 dosyasını oluşturamadı."
        );
      }

      const outputBuffer = fs.readFileSync(
        outputFile
      );

      if (
        outputBuffer.length < 12 ||
        outputBuffer.subarray(4, 8).toString("ascii") !== "ftyp"
      ) {
        throw new Error(
          "Oluşturulan çıktı geçerli MP4 dosyası değil."
        );
      }

      console.log(
        "NOVA MP4 HAZIR:",
        outputBuffer.length,
        "bayt"
      );

      res.setHeader(
        "Content-Type",
        "video/mp4"
      );

      res.setHeader(
        "Content-Disposition",
        'inline; filename="nova-video.mp4"'
      );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.setHeader(
        "Content-Length",
        String(outputBuffer.length)
      );

      return res.send(outputBuffer);

    } catch (error) {
      console.error(
        "PREPARE VIDEO ERROR:",
        error?.stack || error
      );

      if (!res.headersSent) {
        return res.status(500).json({
          ok: false,
          error: "NOVA video oluşturma hatası.",
          details:
            error?.message || String(error)
        });
      }

    } finally {
      try {
        if (
          tempDir &&
          fs.existsSync(tempDir)
        ) {
          fs.rmSync(
            tempDir,
            {
              recursive: true,
              force: true
            }
          );
        }
      } catch (cleanupError) {
        console.error(
          "Video geçici dosyaları temizlenemedi:",
          cleanupError.message
        );
      }
    }
  }
);

// =============================================================
// SERVER
// =============================================================

app.listen(PORT, () => {
  console.log(
    `NOVA Music Server listening on port ${PORT}`
  );
});
