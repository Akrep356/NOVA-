
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errorMessage = e => e?.message || String(e);
const cleanBase64 = v => String(v || "").replace(/^data:[^;]+;base64,/i, "");

function hfHeaders(extra = {}) {
  const headers = { ...extra };
  if (HF_TOKEN) headers.Authorization = `Bearer ${HF_TOKEN}`;
  return headers;
}

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

app.get("/wan-api-test", async (_req, res) => {
  try {
    const r = await fetch(`${HF_WAN_SPACE}/gradio_api/info`, {
      signal: AbortSignal.timeout(30000)
    });
    res.status(r.status).type("application/json").send(await r.text());
  } catch (e) {
    res.status(500).json({ ok: false, error: errorMessage(e) });
  }
});

// ==================== MUSIC ====================

app.post("/generate", async (req, res) => {
  try {
    if (!STABILITY_API_KEY) {
      return res.status(500).json({
        error: "STABILITY_API_KEY is not configured."
      });
    }

    const prompt = typeof req.body?.prompt === "string"
      ? req.body.prompt.trim() : "";

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required." });
    }

    if (prompt.length > 10000) {
      return res.status(400).json({ error: "prompt is too long." });
    }

    const n = Number(req.body?.duration ?? 30);
    const duration = Math.max(
      1,
      Math.min(190, Number.isFinite(n) ? n : 30)
    );

    const form = new FormData();
    form.append("prompt", prompt);
    form.append("output_format", "mp3");
    form.append("duration", String(duration));
    form.append("model", "stable-audio-2.5");
    form.append("steps", "8");
    form.append("cfg_scale", "1");

    const r = await fetch(
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

    if (!r.ok) {
      const details = await r.text();
      console.error("STABLE AUDIO ERROR:", r.status, details);

      return res.status(r.status).json({
        error: "Stable Audio request failed.",
        details
      });
    }

    const buffer = Buffer.from(await r.arrayBuffer());

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
  } catch (e) {
    console.error("Music generation error:", e);

    if (!res.headersSent) {
      res.status(500).json({
        error: "NOVA music generation server error.",
        details: errorMessage(e)
      });
    }
  }
});

// ==================== LYRICS ====================

app.post("/generate-lyrics", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured."
      });
    }

    const topic = typeof req.body?.topic === "string"
      ? req.body.topic.trim() : "";

    if (!topic) {
      return res.status(400).json({ error: "topic is required." });
    }

    if (topic.length > 2000) {
      return res.status(400).json({ error: "topic is too long." });
    }

    const prompt = `Sen NOVA adlı müzik uygulamasının profesyonel Türkçe şarkı sözü yazarısın.

Konu:
${topic}

Tamamen Türkçe, doğal, duygusal ve müzikal bir şarkı sözü yaz.
Sadece şarkı sözünü döndür. Açıklama veya giriş yazma.
Şu bölümleri kullan:
[Kıta 1]
[Ön Nakarat]
[Nakarat]
[Kıta 2]
[Ön Nakarat]
[Nakarat]
[Köprü]
[Final Nakarat]`;

    const r = await fetch(
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

    const text = await r.text();

    if (!r.ok) {
      console.error("GEMINI ERROR:", r.status, text);

      return res.status(r.status).json({
        error: "Gemini request failed.",
        details: text
      });
    }

    const data = JSON.parse(text);
    const lyrics = data?.candidates?.[0]?.content?.parts
      ?.map(p => p?.text || "").join("").trim();

    if (!lyrics) {
      return res.status(502).json({
        error: "Gemini returned empty lyrics.",
        details: data
      });
    }

    return res.json({ ok: true, lyrics });
  } catch (e) {
    console.error("Lyrics generation error:", e);

    if (!res.headersSent) {
      res.status(500).json({
        error: "NOVA lyrics generation server error.",
        details: errorMessage(e)
      });
    }
  }
});

// ==================== WAN HELPERS ====================

async function uploadImageToWan(buffer, filename, mimeType) {
  const form = new FormData();

  form.append(
    "files",
    new Blob([buffer], { type: mimeType || "image/jpeg" }),
    filename || "nova-image.jpg"
  );

  const r = await fetch(`${HF_WAN_SPACE}/gradio_api/upload`, {
    method: "POST",
    headers: hfHeaders(),
    body: form,
    signal: AbortSignal.timeout(90000)
  });

  const text = await r.text();

  console.log("WAN UPLOAD STATUS:", r.status, text.slice(0, 1000));

  if (!r.ok) {
    throw new Error(`WAN upload failed: ${r.status} ${text}`);
  }

  const data = JSON.parse(text);

  if (Array.isArray(data) && typeof data[0] === "string") {
    return data[0];
  }

  if (Array.isArray(data) && data[0]?.path) {
    return data[0].path;
  }

  if (typeof data === "string") return data;
  if (data?.path) return data.path;

  throw new Error("WAN upload did not return a file path.");
}

async function waitForWanResult(eventId) {
  const r = await fetch(
    `${HF_WAN_SPACE}/gradio_api/call/generate_video/${eventId}`,
    {
      headers: hfHeaders({ Accept: "text/event-stream" }),
      signal: AbortSignal.timeout(600000)
    }
  );

  const text = await r.text();

  console.log("WAN RESULT STATUS:", r.status);
  console.log("WAN RESULT RAW RESPONSE:", text.slice(0, 12000));

  if (!r.ok) {
    throw new Error(`WAN result failed: ${r.status} ${text}`);
  }

  let result = null;

  for (const block of text.split(/\n\n+/).map(x => x.trim()).filter(Boolean)) {
    const event =
      block.match(/(?:^|\n)event:\s*([^\n]+)/i)?.[1]?.trim() || "";

    const dataText =
      block.match(/(?:^|\n)data:\s*([\s\S]*)/i)?.[1]?.trim() || "";

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
        (
          typeof data === "string"
            ? data
            : data?.message || data?.error || JSON.stringify(data)
        )
      );
    }

    if (event === "complete") return data;
    if (data !== null) result = data;
  }

  if (result !== null) return result;

  throw new Error("WAN returned no video result.");
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

  const item =
    items.find(x => /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(x.value)) ||
    items.find(x => x.type === "url") ||
    items.find(x => x.type === "path");

  if (!item) return null;

  if (/^https?:\/\//i.test(item.value)) return item.value;

  return `${HF_WAN_SPACE}/gradio_api/file=${encodeURIComponent(item.value)}`;
}

// ==================== WAN VIDEO ====================

app.post("/wan-video", async (req, res) => {
  try {
    const imageBase64 = typeof req.body?.imageBase64 === "string"
      ? req.body.imageBase64 : "";

    const mime = typeof req.body?.imageMimeType === "string"
      ? req.body.imageMimeType : "image/jpeg";

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
        error: "Image is larger than 15 MB."
      });
    }

    const n = Number(req.body?.duration ?? 3.5);
    const duration = Math.max(
      0.5,
      Math.min(5, Number.isFinite(n) ? n : 3.5)
    );

    const filename = mime.includes("png")
      ? "nova-input.png"
      : "nova-input.jpg";

    const uploadedPath = await uploadImageToWan(
      imageBuffer,
      filename,
      mime
    );

    const imageData = {
      path: uploadedPath,
      orig_name: filename,
      size: imageBuffer.length,
      mime_type: mime,
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

    const gen = await fetch(
      `${HF_WAN_SPACE}/gradio_api/call/generate_video`,
      {
        method: "POST",
        headers: hfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ data: wanData }),
        signal: AbortSignal.timeout(120000)
      }
    );

    const genText = await gen.text();

    console.log("WAN GENERATE STATUS:", gen.status, genText.slice(0, 5000));

    if (!gen.ok) {
      return res.status(502).json({
        ok: false,
        error: "WAN video generation request failed.",
        details: genText
      });
    }

    const genData = JSON.parse(genText);

    if (!genData?.event_id) {
      return res.status(502).json({
        ok: false,
        error: "WAN did not return an event_id.",
        details: genData
      });
    }

    const result = await waitForWanResult(genData.event_id);
    const videoUrl = findWanVideoFile(result);

    if (!videoUrl) {
      return res.status(502).json({
        ok: false,
        error: "WAN video file was not found.",
        result
      });
    }

    const videoResponse = await fetch(videoUrl, {
      headers: hfHeaders(),
      signal: AbortSignal.timeout(180000)
    });

    if (!videoResponse.ok) {
      throw new Error(
        `WAN video download failed: ${videoResponse.status} ${await videoResponse.text()}`
      );
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
  } catch (e) {
    console.error("WAN VIDEO ERROR:", e);

    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: "NOVA WAN video generation server error.",
        details: errorMessage(e)
      });
    }
  }
});

// ==================== MERGE VIDEO + AUDIO ====================

app.post("/merge-video-audio", async (req, res) => {
  let tempDir = null;

  try {
    const videoBase64 = typeof req.body?.videoBase64 === "string"
      ? req.body.videoBase64 : "";

    const audioBase64 = typeof req.body?.audioBase64 === "string"
      ? req.body.audioBase64 : "";

    if (!videoBase64 || !audioBase64) {
      return res.status(400).json({
        ok: false,
        error: "videoBase64 and audioBase64 are required."
      });
    }

    const video = Buffer.from(cleanBase64(videoBase64), "base64");
    const audio = Buffer.from(cleanBase64(audioBase64), "base64");

    if (!video.length || !audio.length) {
      return res.status(400).json({
        ok: false,
        error: "Video or audio data is empty."
      });
    }

    if (video.length > 50 * 1024 * 1024) {
      return res.status(413).json({
        ok: false,
        error: "Video exceeds 50 MB."
      });
    }

    if (audio.length > 30 * 1024 * 1024) {
      return res.status(413).json({
        ok: false,
        error: "Audio exceeds 30 MB."
      });
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-merge-"));

    const inputVideo = path.join(tempDir, "input-video.mp4");
    const inputAudio = path.join(tempDir, "input-audio.mp3");
    const output = path.join(tempDir, "output-video.mp4");

    fs.writeFileSync(inputVideo, video);
    fs.writeFileSync(inputAudio, audio);

    await execFileAsync("ffmpeg", [
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
      output
    ], {
      timeout: 240000,
      maxBuffer: 20 * 1024 * 1024
    });

    if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
      throw new Error("FFmpeg output video was not created.");
    }

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="nova-music-video.mp4"'
    );
    res.setHeader("Cache-Control", "no-store");

    return res.send(fs.readFileSync(output));
  } catch (e) {
    console.error("VIDEO + AUDIO MERGE ERROR:", e);

    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: "NOVA video + audio merge server error.",
        details: errorMessage(e)
      });
    }
  } finally {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error("Merge cleanup error:", e);
    }
  }
});

// ==================== WIKIMEDIA VIDEO SEARCH ====================

// Commons istekleri tek bir sırada yürütülür.
// Böylece eşzamanlı video talepleri istekleri üst üste bindirmez.
let lastCommonsRequestAt = 0;
let commonsQueue = Promise.resolve();

async function commonsFetch(url) {
  const run = async () => {
    const wait = Math.max(
      0,
      3500 - (Date.now() - lastCommonsRequestAt)
    );

    if (wait > 0) await sleep(wait);

    lastCommonsRequestAt = Date.now();

    const r = await fetch(url, {
      headers: {
        "User-Agent": "NOVA-Music-Video/1.0",
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(25000)
    });

    const text = await r.text();

    if (r.status === 429 || r.status === 503) {
      throw new Error(
        `Wikimedia HTTP ${r.status}: istek sınırına ulaşıldı.`
      );
    }

    if (!r.ok) {
      throw new Error(
        `Wikimedia HTTP ${r.status}: ${text.slice(0, 400)}`
      );
    }

    const data = JSON.parse(text);

    if (data?.error) {
      throw new Error(JSON.stringify(data.error));
    }

    return data;
  };

  const request = commonsQueue.then(run, run);

  commonsQueue = request.catch(() => {});

  return request;
}

async function searchCommonsVideos(query, maxResults = 10) {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srnamespace: "6",
    srlimit: String(Math.min(maxResults, 10)),
    srwhat: "text",
    format: "json",
    formatversion: "2"
  });

  const search = await commonsFetch(
    "https://commons.wikimedia.org/w/api.php?" + params.toString()
  );

  const ids = (search?.query?.search || [])
    .map(x => Number(x.pageid))
    .filter(Number.isFinite);

  if (!ids.length) return [];

  const infoParams = new URLSearchParams({
    action: "query",
    pageids: ids.join("|"),
    prop: "imageinfo",
    iiprop: "url|mime|size|mediatype",
    format: "json",
    formatversion: "2"
  });

  const info = await commonsFetch(
    "https://commons.wikimedia.org/w/api.php?" + infoParams.toString()
  );

  return (info?.query?.pages || []).map(page => {
    const i = page?.imageinfo?.[0];

    if (!i?.url) return null;

    const isVideo =
      i.mediatype === "VIDEO" ||
      /^video\//i.test(i.mime || "") ||
      /\.(mp4|webm|ogv|mov|m4v)(?:$|[?#])/i.test(i.url) ||
      /\.(mp4|webm|ogv|mov|m4v)$/i.test(page.title || "");

    const size = Number(i.size);

    if (
      !isVideo ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > 80 * 1024 * 1024
    ) {
      return null;
    }

    return {
      url: i.url,
      mime: i.mime || "",
      size,
      title: page.title || ""
    };
  }).filter(Boolean);
}

// Önceden loglarda görülen, doğrudan indirilebilir yedek video.
// Wikimedia araması engellendiğinde kullanılabilir.
const FALLBACK_VIDEO = {
  url: "https://upload.wikimedia.org/wikipedia/commons/9/9b/Ocean_surface_waves_02.ogv",
  mime: "video/ogg",
  size: 0,
  title: "Ocean surface waves 02.ogv"
};

// ==================== PREPARE VIDEO ====================

app.post("/prepare-video", async (req, res) => {
  let tempDir = null;

  try {
    console.log("NOVA PREPARE VIDEO REQUEST STARTED");
    console.log("Request body fields:", Object.keys(req.body || {}));

    const lyrics = typeof req.body?.lyrics === "string"
      ? req.body.lyrics.trim() : "";

    const style = typeof req.body?.style === "string"
      ? req.body.style.trim() : "Sinematik";

    const visual = typeof req.body?.visualDescription === "string"
      ? req.body.visualDescription.trim() : "";

    const n = Number(req.body?.duration ?? 30);
    const duration = Math.max(
      1,
      Math.min(180, Number.isFinite(n) && n > 0 ? n : 30)
    );

    const orientation = ["9:16", "16:9", "1:1"].includes(req.body?.orientation)
      ? req.body.orientation : "9:16";

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

    const cleanQuery = value => String(value || "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70);

    const keywords = styleMap[style] ||
      [cleanQuery(style) || "cinematic landscape"];

    // Her video isteğinde yalnızca bir arama sorgusu kullanılır.
    // Gereksiz sorgular Wikimedia'nın HTTP 429 sınırını tetikleyebilir.
    const firstQuery = cleanQuery(visual) || cleanQuery(keywords[0]);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-video-"));

    let sources = [];

    try {
      console.log("WIKIMEDIA ARAMA:", firstQuery);

      sources = await searchCommonsVideos(firstQuery, 10);

      console.log(
        "WIKIMEDIA ARAMA SONUÇ SAYISI:",
        firstQuery,
        sources.length
      );
    } catch (e) {
      console.error("WIKIMEDIA ARAMA HATASI:", errorMessage(e));
    }

    // Arama sonuç vermezse bilinen doğrudan video kaynağını dene.
    if (!sources.length) {
      console.log("WIKIMEDIA YEDEK VIDEO KAYNAĞI KULLANILACAK");
      sources = [FALLBACK_VIDEO];
    }

    console.log(
      "VIDEO KAYNAKLARI HAZIR. KAYNAK SAYISI:",
      sources.length
    );

    let width = 720;
    let height = 1280;

    if (orientation === "16:9") {
      width = 1280;
      height = 720;
    }

    if (orientation === "1:1") {
      width = 720;
      height = 720;
    }

    const filter =
      `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},setsar=1`;

    const segments = [];
    let remaining = duration;

    // Kaynak sayısı süreyi karşılamazsa mevcut kaynaklar tekrar kullanılır.
    const maxSegments = Math.ceil(duration / 10) + sources.length;

    for (
      let i = 0;
      i < maxSegments && remaining > 0.01;
      i++
    ) {
      const source = sources[i % sources.length];
      const segmentDuration = Math.min(10, remaining);

      const inputFile = path.join(tempDir, `source-${i}.video`);
      const segmentFile = path.join(tempDir, `segment-${i}.mp4`);

      try {
        console.log("VIDEO İNDİRİLİYOR:", source.title, source.url);

        const r = await fetch(source.url, {
          headers: {
            "User-Agent": "NOVA-Music-Video/1.0"
          },
          signal: AbortSignal.timeout(60000)
        });

        if (!r.ok) {
          throw new Error(`Video download HTTP ${r.status}`);
        }

        const contentType = r.headers.get("content-type") || "";

        if (/text\/html|application\/json/i.test(contentType)) {
          throw new Error("Kaynak video yerine HTML veya JSON döndü.");
        }

        const buffer = Buffer.from(await r.arrayBuffer());

        if (!buffer.length || buffer.length > 80 * 1024 * 1024) {
          throw new Error("Kaynak video boş veya 80 MB sınırını aşıyor.");
        }

        const mp4 = buffer.length >= 12 &&
          buffer.subarray(4, 8).toString("ascii") === "ftyp";

        const webm = buffer.length >= 4 &&
          buffer.subarray(0, 4).equals(
            Buffer.from([0x1a, 0x45, 0xdf, 0xa3])
          );

        const ogg = buffer.subarray(0, 4).toString("ascii") === "OggS";

        if (!mp4 && !webm && !ogg) {
          throw new Error("İndirilen kaynak geçerli bir video dosyası değil.");
        }

        fs.writeFileSync(inputFile, buffer);

        await execFileAsync("ffmpeg", [
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
        ], {
          timeout: 180000,
          maxBuffer: 20 * 1024 * 1024
        });

        if (
          !fs.existsSync(segmentFile) ||
          fs.statSync(segmentFile).size === 0
        ) {
          throw new Error("FFmpeg boş video segmenti oluşturdu.");
        }

        segments.push(segmentFile);
        remaining -= segmentDuration;

        console.log("VIDEO SEGMENT HAZIR:", i, segmentDuration);
      } catch (e) {
        console.error(
          "VIDEO SEGMENT HATASI:",
          source.title,
          errorMessage(e)
        );
      }
    }

    if (!segments.length || remaining > 0.01) {
      throw new Error(
        `İstenen video süresi tamamlanamadı. Kalan süre: ${remaining.toFixed(1)} saniye.`
      );
    }

    const concatFile = path.join(tempDir, "concat.txt");
    const outputFile = path.join(tempDir, "nova-video.mp4");

    fs.writeFileSync(
      concatFile,
      segments.map(file =>
        `file '${file.replace(/'/g, "'\\''")}'`
      ).join("\n"),
      "utf8"
    );

    await execFileAsync("ffmpeg", [
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
    ], {
      timeout: 240000,
      maxBuffer: 20 * 1024 * 1024
    });

    if (
      !fs.existsSync(outputFile) ||
      fs.statSync(outputFile).size === 0
    ) {
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
  } catch (e) {
    console.error("PREPARE VIDEO ERROR:", e?.stack || e);

    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: "NOVA video oluşturma hatası.",
        details: errorMessage(e)
      });
    }
  } finally {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error(
        "Video geçici dosyaları temizlenemedi:",
        errorMessage(e)
      );
    }
  }
});

// ==================== SERVER ====================

app.listen(PORT, () => {
  console.log(`NOVA Music Server listening on port ${PORT}`);
});
