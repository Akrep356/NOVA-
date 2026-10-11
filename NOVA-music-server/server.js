const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;

const STABILITY_API_KEY = process.env.STABILITY_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const HF_TOKEN = process.env.HF_TOKEN || "";
const HF_WAN_SPACE =
  "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space";

app.use(cors());
app.use(express.json({ limit: "100mb" }));

function hfHeaders(extra = {}) {
  const headers = { ...extra };
  if (HF_TOKEN) headers.Authorization = `Bearer ${HF_TOKEN}`;
  return headers;
}

function cleanBase64(value) {
  return String(value || "").replace(/^data:[^;]+;base64,/i, "");
}

function errorMessage(error) {
  return error?.message || String(error);
}

async function responseText(response) {
  return await response.text();
}

// =============================================================
// ANA SAYFA
// =============================================================

app.get("/", (_req, res) => {
  res.json({
    name: "NOVA Music Server",
    status: "ok",
    endpoints: [
      "GET /health",
      "GET /wan-api-test",
      "POST /generate",
      "POST /generate-lyrics",
      "POST /prepare-video",
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

app.get("/wan-api-test", async (_req, res) => {
  try {
    const response = await fetch(
      `${HF_WAN_SPACE}/gradio_api/info`,
      { signal: AbortSignal.timeout(30000) }
    );

    const text = await responseText(response);
    res.status(response.status).type("application/json").send(text);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: errorMessage(error)
    });
  }
});

// =============================================================
// MÜZİK ÜRETİMİ
// =============================================================

app.post("/generate", async (req, res) => {
  try {
    if (!STABILITY_API_KEY) {
      return res.status(500).json({
        error: "STABILITY_API_KEY is not configured on the server."
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

    const requestedDuration = Number(req.body?.duration ?? 30);
    const duration = Math.max(
      1,
      Math.min(190, Number.isFinite(requestedDuration) ? requestedDuration : 30)
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
          authorization: `Bearer ${STABILITY_API_KEY}`,
          accept: "audio/*",
          "stability-client-id": "NOVA",
          "stability-client-version": "1.0.0"
        },
        body: form,
        signal: AbortSignal.timeout(240000)
      }
    );

    if (!response.ok) {
      const details = await responseText(response);
      console.error("STABLE AUDIO ERROR:", response.status, details);
      return res.status(response.status).json({
        error: "Stable Audio request failed.",
        details
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (!buffer.length) {
      return res.status(502).json({
        error: "Stable Audio returned an empty file."
      });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="nova-generated.mp3"'
    );
    res.setHeader("Cache-Control", "no-store");
    return res.send(buffer);
  } catch (error) {
    console.error("Music generation error:", error);
    return res.status(500).json({
      error: "NOVA music generation server error.",
      details: errorMessage(error)
    });
  }
});

// =============================================================
// ŞARKI SÖZÜ ÜRETİMİ
// =============================================================

app.post("/generate-lyrics", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured on the server."
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

Konu:
${topic}

Tamamen Türkçe, doğal, duygusal ve müzikal bir şarkı sözü yaz.
Sadece şarkı sözünü döndür. Açıklama veya giriş yazma.
Bölümleri şu yapıda belirt:

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
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 3000 }
        }),
        signal: AbortSignal.timeout(120000)
      }
    );

    const text = await responseText(response);

    if (!response.ok) {
      console.error("GEMINI ERROR:", response.status, text);
      return res.status(response.status).json({
        error: "Gemini request failed.",
        details: text
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      return res.status(502).json({
        error: "Gemini returned invalid JSON.",
        details: text
      });
    }

    const lyrics = data?.candidates?.[0]?.content?.parts
      ?.map(part => part?.text || "")
      .join("")
      .trim();

    if (!lyrics) {
      return res.status(502).json({
        error: "Gemini returned empty lyrics.",
        details: data
      });
    }

    return res.json({ ok: true, lyrics });
  } catch (error) {
    console.error("Lyrics generation error:", error);
    return res.status(500).json({
      error: "NOVA lyrics generation server error.",
      details: errorMessage(error)
    });
  }
});

// =============================================================
// WAN GÖRSEL YÜKLEME
// =============================================================

async function uploadImageToWan(buffer, filename, mimeType) {
  const form = new FormData();

  form.append(
    "files",
    new Blob([buffer], { type: mimeType || "image/jpeg" }),
    filename || "nova-image.jpg"
  );

  const response = await fetch(
    `${HF_WAN_SPACE}/gradio_api/upload`,
    {
      method: "POST",
      headers: hfHeaders(),
      body: form,
      signal: AbortSignal.timeout(90000)
    }
  );

  const text = await responseText(response);

  console.log("WAN UPLOAD STATUS:", response.status);
  console.log("WAN UPLOAD RESPONSE:", text);

  if (!response.ok) {
    throw new Error(`WAN upload failed: ${response.status} ${text}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error("WAN upload returned invalid JSON.");
  }

  if (Array.isArray(data) && typeof data[0] === "string") {
    return data[0];
  }

  if (Array.isArray(data) && data[0]?.path) {
    return data[0].path;
  }

  if (typeof data === "string") {
    return data;
  }

  if (data?.path) {
    return data.path;
  }

  throw new Error("WAN upload did not return a file path.");
}

async function waitForWanResult(eventId) {
  const response = await fetch(
    `${HF_WAN_SPACE}/gradio_api/call/generate_video/${eventId}`,
    {
      headers: hfHeaders({ Accept: "text/event-stream" }),
      signal: AbortSignal.timeout(600000)
    }
  );

  const text = await responseText(response);

  console.log("WAN RESULT STATUS:", response.status);
  console.log("WAN RESULT RAW RESPONSE:", text);

  if (!response.ok) {
    throw new Error(`WAN result failed: ${response.status} ${text}`);
  }

  const blocks = text.split(/\n\n+/).map(x => x.trim()).filter(Boolean);
  let result = null;

  for (const block of blocks) {
    const event = block.match(/(?:^|\n)event:\s*([^\n]+)/i)?.[1]?.trim() || "";
    const dataText = block.match(/(?:^|\n)data:\s*([\s\S]*)/i)?.[1]?.trim() || "";

    console.log("WAN SSE BLOCK:", block);

    let data = null;
    if (dataText) {
      try {
        data = JSON.parse(dataText);
      } catch (_) {
        data = dataText;
      }
    }

    if (event === "error") {
      throw new Error(
        "WAN generation error: " +
        (typeof data === "string"
          ? data
          : data?.message || data?.error || JSON.stringify(data))
      );
    }

    if (event === "complete") {
      return data;
    }

    if (data !== null) {
      result = data;
    }
  }

  if (result !== null) {
    return result;
  }

  throw new Error("WAN returned no video result. Check the Render logs.");
}

function findWanVideoFile(result) {
  const items = [];

  function walk(value) {
    if (value == null) return;

    if (typeof value === "string") {
      items.push({ value, type: "string" });
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (typeof value === "object") {
      if (typeof value.url === "string") {
        items.push({ value: value.url, type: "url" });
      }

      if (typeof value.path === "string") {
        items.push({ value: value.path, type: "path" });
      }

      Object.values(value).forEach(walk);
    }
  }

  walk(result);

  const video = items.find(item =>
    /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(item.value)
  );

  const item = video || items.find(x => x.type === "url") ||
    items.find(x => x.type === "path");

  if (!item) return null;

  if (/^https?:\/\//i.test(item.value)) return item.value;

  return `${HF_WAN_SPACE}/gradio_api/file=${encodeURIComponent(item.value)}`;
}

// =============================================================
// WAN 2.2 İLE SANATÇIYI CANLANDIR
// =============================================================

app.post("/wan-video", async (req, res) => {
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
      typeof req.body?.prompt === "string" && req.body.prompt.trim()
        ? req.body.prompt.trim()
        : "Bu görüntüyü doğal ve sinematik şekilde canlandır.";

    if (!imageBase64) {
      return res.status(400).json({
        ok: false,
        error: "imageBase64 is required."
      });
    }

    const imageBuffer = Buffer.from(cleanBase64(imageBase64), "base64");

    if (!imageBuffer.length) {
      return res.status(400).json({
        ok: false,
        error: "Image data is empty."
      });
    }

    if (imageBuffer.length > 15 * 1024 * 1024) {
      return res.status(413).json({
        ok: false,
        error: "Image is too large. Maximum size is 15 MB."
      });
    }

    const durationInput = Number(req.body?.duration ?? 3.5);
    const duration = Math.max(
      0.5,
      Math.min(5, Number.isFinite(durationInput) ? durationInput : 3.5)
    );

    const filename = imageMimeType.includes("png")
      ? "nova-input.png"
      : "nova-input.jpg";

    const uploadedPath = await uploadImageToWan(
      imageBuffer,
      filename,
      imageMimeType
    );

    const imageData = {
      path: uploadedPath,
      orig_name: filename,
      size: imageBuffer.length,
      mime_type: imageMimeType,
      is_stream: false,
      meta: { _type: "gradio.FileData" }
    };

    const wanData = [
      imageData,
      prompt,
      6,
      "blurry, distorted face, deformed hands, extra fingers, duplicate person, bad anatomy, low quality",
      duration,
      1,
      1,
      42,
      true
    ];

    const generateResponse = await fetch(
      `${HF_WAN_SPACE}/gradio_api/call/generate_video`,
      {
        method: "POST",
        headers: hfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ data: wanData }),
        signal: AbortSignal.timeout(120000)
      }
    );

    const generateText = await responseText(generateResponse);
    console.log("WAN GENERATE STATUS:", generateResponse.status);
    console.log("WAN GENERATE RESPONSE:", generateText);

    if (!generateResponse.ok) {
      return res.status(502).json({
        ok: false,
        error: "WAN video generation request failed.",
        details: generateText
      });
    }

    let generateData;
    try {
      generateData = JSON.parse(generateText);
    } catch (_) {
      return res.status(502).json({
        ok: false,
        error: "WAN returned invalid generation response.",
        details: generateText
      });
    }

    if (!generateData?.event_id) {
      return res.status(502).json({
        ok: false,
        error: "WAN did not return an event_id.",
        details: generateData
      });
    }

    const result = await waitForWanResult(generateData.event_id);
    console.log("WAN COMPLETE RESULT:", JSON.stringify(result));

    const videoUrl = findWanVideoFile(result);

    if (!videoUrl) {
      return res.status(502).json({
        ok: false,
        error: "WAN completed but video file was not found.",
        result
      });
    }

    const videoResponse = await fetch(videoUrl, {
      headers: hfHeaders(),
      signal: AbortSignal.timeout(180000)
    });

    if (!videoResponse.ok) {
      const details = await responseText(videoResponse);
      throw new Error(`WAN video download failed: ${videoResponse.status} ${details}`);
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

    if (!videoBuffer.length) {
      throw new Error("WAN video file is empty.");
    }

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
      error: "NOVA WAN video generation server error.",
      details: errorMessage(error)
    });
  }
});

// =============================================================
// VİDEO + MÜZİK BİRLEŞTİRME
// =============================================================

app.post("/merge-video-audio", async (req, res) => {
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

    if (!videoBase64 || !audioBase64) {
      return res.status(400).json({
        ok: false,
        error: "videoBase64 and audioBase64 are required."
      });
    }

    const videoBuffer = Buffer.from(cleanBase64(videoBase64), "base64");
    const audioBuffer = Buffer.from(cleanBase64(audioBase64), "base64");

    if (!videoBuffer.length || !audioBuffer.length) {
      return res.status(400).json({
        ok: false,
        error: "Video or audio data is empty."
      });
    }

    if (videoBuffer.length > 50 * 1024 * 1024) {
      return res.status(413).json({
        ok: false,
        error: "Video is too large. Maximum size is 50 MB."
      });
    }

    if (audioBuffer.length > 30 * 1024 * 1024) {
      return res.status(413).json({
        ok: false,
        error: "Audio is too large. Maximum size is 30 MB."
      });
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-merge-"));

    const inputVideo = path.join(tempDir, "input-video.mp4");
    const inputAudio = path.join(tempDir, "input-audio.mp3");
    const outputVideo = path.join(tempDir, "output-video.mp4");

    fs.writeFileSync(inputVideo, videoBuffer);
    fs.writeFileSync(inputAudio, audioBuffer);

    await execFileAsync(
      "ffmpeg",
      [
        "-y",
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
      ],
      {
        timeout: 240000,
        maxBuffer: 20 * 1024 * 1024
      }
    );

    if (!fs.existsSync(outputVideo) || fs.statSync(outputVideo).size === 0) {
      throw new Error("FFmpeg output video was not created.");
    }

    const outputBuffer = fs.readFileSync(outputVideo);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="nova-music-video.mp4"'
    );
    res.setHeader("Cache-Control", "no-store");
    return res.send(outputBuffer);
  } catch (error) {
    console.error("VIDEO + AUDIO MERGE ERROR:", error);
    return res.status(500).json({
      ok: false,
      error: "NOVA video + audio merge server error.",
      details: errorMessage(error)
    });
  } finally {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error("Merge cleanup error:", error);
    }
  }
});

// =============================================================
// WIKIMEDIA COMMONS VİDEO ARAMA YARDIMCISI
// =============================================================

async function searchCommonsVideos(query, maxResults = 30) {
  const searchParams = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srnamespace: "6",
    srlimit: String(maxResults),
    srwhat: "text",
    format: "json",
    formatversion: "2"
  });

  const searchResponse = await fetch(
    "https://commons.wikimedia.org/w/api.php?" + searchParams.toString(),
    {
      headers: {
        "User-Agent": "NOVA-Music-Video/1.0 (video generation application)",
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(25000)
    }
  );

  const searchText = await responseText(searchResponse);

  if (!searchResponse.ok) {
    throw new Error(
      `Wikimedia search HTTP ${searchResponse.status}: ${searchText.slice(0, 500)}`
    );
  }

  let searchData;
  try {
    searchData = JSON.parse(searchText);
  } catch (_) {
    throw new Error("Wikimedia search returned invalid JSON.");
  }

  if (searchData?.error) {
    throw new Error(JSON.stringify(searchData.error));
  }

  const results = searchData?.query?.search || [];
  const pageIds = results
    .map(item => Number(item.pageid))
    .filter(Number.isFinite);

  if (!pageIds.length) return [];

  const infoParams = new URLSearchParams({
    action: "query",
    pageids: pageIds.join("|"),
    prop: "imageinfo",
    iiprop: "url|mime|size|mediatype",
    format: "json",
    formatversion: "2"
  });

  const infoResponse = await fetch(
    "https://commons.wikimedia.org/w/api.php?" + infoParams.toString(),
    {
      headers: {
        "User-Agent": "NOVA-Music-Video/1.0 (video generation application)",
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(25000)
    }
  );

  const infoText = await responseText(infoResponse);

  if (!infoResponse.ok) {
    throw new Error(
      `Wikimedia file info HTTP ${infoResponse.status}: ${infoText.slice(0, 500)}`
    );
  }

  let infoData;
  try {
    infoData = JSON.parse(infoText);
  } catch (_) {
    throw new Error("Wikimedia file info returned invalid JSON.");
  }

  return (infoData?.query?.pages || [])
    .map(page => {
      const info = page?.imageinfo?.[0];
      if (!info?.url) return null;

      const url = info.url;
      const mime = info.mime || "";
      const title = page.title || "";
      const mediaType = info.mediatype || "";

      const isVideo =
        mediaType === "VIDEO" ||
        /^video\//i.test(mime) ||
        /\.(mp4|webm|ogv|mov|m4v)(?:$|[?#])/i.test(url) ||
        /\.(mp4|webm|ogv|mov|m4v)$/i.test(title);

      if (!isVideo) return null;

      const size = Number(info.size);
      if (!Number.isFinite(size) || size <= 0 || size > 80 * 1024 * 1024) {
        return null;
      }

      return { url, mime, size, title };
    })
    .filter(Boolean);
}

// =============================================================
// VİDEO KLİBİ HAZIRLAMA
// =============================================================

app.post("/prepare-video", async (req, res) => {
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

    const durationInput = Number(req.body?.duration ?? 30);
    const duration = Math.max(
      1,
      Math.min(180, Number.isFinite(durationInput) && durationInput > 0 ? durationInput : 30)
    );

    const orientation = ["9:16", "16:9", "1:1"].includes(req.body?.orientation)
      ? req.body.orientation
      : "9:16";

    if (!lyrics) {
      return res.status(400).json({
        ok: false,
        error: "Şarkı sözleri gerekli."
      });
    }

    const styleMap = {
      "Sinematik": ["cinematic landscape", "film landscape"],
      "Duygusal": ["sunset landscape", "ocean sunset"],
      "Enerjik": ["dance festival", "city lights"],
      "Romantik": ["romantic sunset", "couple nature"],
      "Karanlık": ["dark dramatic", "storm clouds"],
      "Neon": ["neon city", "night city"],
      "Doğa": ["nature landscape", "mountains forest"],
      "Konser": ["live concert", "concert crowd"]
    };

    const cleanQuery = value =>
      String(value || "")
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);

    const keywords = styleMap[style] || [
      cleanQuery(style) || "cinematic landscape",
      "nature landscape"
    ];

    const queries = [];
    const visual = cleanQuery(visualDescription);

    if (visual) {
      queries.push(visual, `${visual} landscape`, `${visual} ${keywords[0]}`);
    }

    queries.push(...keywords);
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

    const uniqueQueries = [...new Set(queries.map(cleanQuery).filter(Boolean))];

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-video-"));

    const sourceMap = new Map();

    for (const query of uniqueQueries) {
      if (sourceMap.size >= 30) break;

      try {
        console.log("WIKIMEDIA ARAMA:", query);

        const found = await searchCommonsVideos(query, 30);

        console.log(
          "WIKIMEDIA ARAMA SONUÇ SAYISI:",
          query,
          found.length
        );

        for (const source of found) {
          if (!sourceMap.has(source.url)) {
            sourceMap.set(source.url, source);
          }
        }
      } catch (error) {
        console.error(
          "WIKIMEDIA ARAMA HATASI:",
          query,
          errorMessage(error)
        );
      }
    }

    const sources = [...sourceMap.values()];

    console.log(
      "WIKIMEDIA ARAMALARI TAMAMLANDI. KAYNAK SAYISI:",
      sources.length
    );

    if (!sources.length) {
      throw new Error(
        "Wikimedia Commons aramalarında uygun video bulunamadı. " +
        "Render günlüklerindeki WIKIMEDIA ARAMA HATASI satırlarını kontrol et."
      );
    }

    let width = 720;
    let height = 1280;

    if (orientation === "16:9") {
      width = 1280;
      height = 720;
    } else if (orientation === "1:1") {
      width = 720;
      height = 720;
    }

    const filter =
      `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},setsar=1`;

    const segments = [];
    let remaining = duration;

    for (let i = 0; i < sources.length && remaining > 0.01; i++) {
      const source = sources[i];
      const segmentDuration = Math.min(10, remaining);
      const inputFile = path.join(tempDir, `source-${i}.video`);
      const segmentFile = path.join(tempDir, `segment-${i}.mp4`);

      try {
        console.log("VIDEO İNDİRİLİYOR:", source.title, source.url);

        const response = await fetch(source.url, {
          headers: {
            "User-Agent": "NOVA-Music-Video/1.0 (video generation application)"
          },
          signal: AbortSignal.timeout(60000)
        });

        if (!response.ok) {
          throw new Error(`Video download HTTP ${response.status}`);
        }

        const contentType = response.headers.get("content-type") || "";

        if (/text\/html|application\/json/i.test(contentType)) {
          throw new Error("Kaynak video yerine HTML veya JSON döndü.");
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        if (!buffer.length || buffer.length > 80 * 1024 * 1024) {
          throw new Error("Kaynak video boş veya 80 MB sınırını aşıyor.");
        }

        const isMp4 =
          buffer.length >= 12 &&
          buffer.subarray(4, 8).toString("ascii") === "ftyp";

        const isWebm =
          buffer.length >= 4 &&
          buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));

        const isOgg = buffer.subarray(0, 4).toString("ascii") === "OggS";

        if (!isMp4 && !isWebm && !isOgg) {
          throw new Error("İndirilen kaynak geçerli bir video dosyası değil.");
        }

        fs.writeFileSync(inputFile, buffer);

        await execFileAsync(
          "ffmpeg",
          [
            "-y",
            "-stream_loop", "-1",
            "-i", inputFile,
            "-t", String(segmentDuration),
            "-vf", filter,
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

        if (!fs.existsSync(segmentFile) || fs.statSync(segmentFile).size === 0) {
          throw new Error("FFmpeg boş video segmenti oluşturdu.");
        }

        segments.push(segmentFile);
        remaining -= segmentDuration;

        console.log("VIDEO SEGMENT HAZIR:", i, segmentDuration);
      } catch (error) {
        console.error(
          "VIDEO SEGMENT HATASI:",
          source.title,
          errorMessage(error)
        );
      }
    }

    if (!segments.length || remaining > 0.01) {
      throw new Error(
        `İstenen video süresi tamamlanamadı. Kalan süre: ${remaining.toFixed(1)} saniye. ` +
        "Kaynak videoları ve Render üzerindeki FFmpeg kurulumunu kontrol et."
      );
    }

    const concatFile = path.join(tempDir, "concat.txt");
    const outputFile = path.join(tempDir, "nova-video.mp4");

    const concatText = segments
      .map(file => `file '${file.replace(/'/g, "'\\''")}'`)
      .join("\n");

    fs.writeFileSync(concatFile, concatText, "utf8");

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

    if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
      throw new Error("FFmpeg son MP4 dosyasını oluşturamadı.");
    }

    const outputBuffer = fs.readFileSync(outputFile);

    if (
      outputBuffer.length < 12 ||
      outputBuffer.subarray(4, 8).toString("ascii") !== "ftyp"
    ) {
      throw new Error("Oluşturulan çıktı geçerli bir MP4 dosyası değil.");
    }

    console.log("NOVA MP4 HAZIR:", outputBuffer.length, "bayt");

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="nova-video.mp4"'
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(outputBuffer.length));

    return res.send(outputBuffer);
  } catch (error) {
    console.error("PREPARE VIDEO ERROR:", error?.stack || error);

    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        error: "NOVA video oluşturma hatası.",
        details: errorMessage(error)
      });
    }
  } finally {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error("Video geçici dosyaları temizlenemedi:", errorMessage(error));
    }
  }
});

// =============================================================
// SERVER
// =============================================================

app.listen(PORT, () => {
  console.log(`NOVA Music Server listening on port ${PORT}`);
});
