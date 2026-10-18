
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;

const STABILITY_API_KEY = process.env.STABILITY_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const HF_TOKEN = process.env.HF_TOKEN || "";
const HF_WAN_SPACE = "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space";

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

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeTempDir(dir) {
  try {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error("TEMP CLEANUP ERROR:", errorMessage(e));
  }
}

// Ağır video işlemlerini sıraya koyarak aynı anda birden fazla
// FFmpeg işleminin bellek tüketmesini önlemeye çalışır.
let heavyQueue = Promise.resolve();

function runHeavyJob(job) {
  const next = heavyQueue.then(job, job);
  heavyQueue = next.catch(() => {});
  return next;
}

async function downloadToFile(url, filePath, options = {}) {
  const r = await fetch(url, {
    headers: options.headers || {
      "User-Agent": "NOVA-Music-Video/1.0"
    },
    signal: AbortSignal.timeout(options.timeout || 60000)
  });

  if (!r.ok) {
    const details = await r.text().catch(() => "");
    throw new Error(
      `Download HTTP ${r.status}: ${details.slice(0, 300)}`
    );
  }

  if (!r.body) {
    throw new Error("Download response has no body.");
  }

  const type = r.headers.get("content-type") || "";

  if (/text\/html|application\/json/i.test(type)) {
    throw new Error("Kaynak video yerine HTML/JSON döndü.");
  }

  await pipeline(
    Readable.fromWeb(r.body),
    fs.createWriteStream(filePath)
  );

  const size = fs.statSync(filePath).size;

  if (!size) throw new Error("İndirilen dosya boş.");

  if (options.maxBytes && size > options.maxBytes) {
    throw new Error(`Dosya ${options.maxBytes} bayt sınırını aşıyor.`);
  }

  return size;
}

async function sendFileStream(res, filePath, contentType, filename) {
  const stat = fs.statSync(filePath);

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${filename}"`
  );
  res.setHeader("Cache-Control", "no-store");

  await pipeline(fs.createReadStream(filePath), res);
}

// ==================== MAIN ====================

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
    videoEngine: "Wikimedia Commons + FFmpeg (low-memory)",
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
    res.status(500).json({
      ok: false,
      error: errorMessage(e)
    });
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
      ? req.body.prompt.trim()
      : "";

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

    if (!r.body) {
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

    await pipeline(Readable.fromWeb(r.body), res);
  } catch (e) {
    console.error("Music generation error:", e);

    if (!res.headersSent) {
      res.status(500).json({
        error: "NOVA music generation server error.",
        details: errorMessage(e)
      });
    } else if (!res.writableEnded) {
      res.destroy(e);
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
      ? req.body.topic.trim()
      : "";

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
      ?.map(p => p?.text || "")
      .join("")
      .trim();

    if (!lyrics) {
      return res.status(502).json({
        error: "Gemini returned empty lyrics.",
        details: data
      });
    }

    res.json({ ok: true, lyrics });
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
  let tempDir = null;

  try {
    await runHeavyJob(async () => {
      const imageBase64 = typeof req.body?.imageBase64 === "string"
        ? req.body.imageBase64
        : "";

      const mime = typeof req.body?.imageMimeType === "string"
        ? req.body.imageMimeType
        : "image/jpeg";

      const prompt =
        typeof req.body?.prompt === "string" && req.body.prompt.trim()
          ? req.body.prompt.trim()
          : "Bu görüntüyü doğal ve sinematik şekilde canlandır.";

      if (!imageBase64) {
        res.status(400).json({
          ok: false,
          error: "imageBase64 is required."
        });
        return;
      }

      const imageBuffer = Buffer.from(cleanBase64(imageBase64), "base64");

      if (!imageBuffer.length) {
        res.status(400).json({
          ok: false,
          error: "Image data is empty."
        });
        return;
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

      imageBuffer.fill(0);

      const imageData = {
        path: uploadedPath,
        orig_name: filename,
        size: 0,
        mime_type: mime,
        is_stream: false,
        meta: { _type: "gradio.FileData" }
      };

      const gen = await fetch(
        `${HF_WAN_SPACE}/gradio_api/call/generate_video`,
        {
          method: "POST",
          headers: hfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            data: [
              imageData,
              prompt,
              6,
              "blurry, distorted face, deformed hands, extra fingers, duplicate person, bad anatomy, low quality",
              duration,
              1,
              1,
              42,
              true
            ]
          }),
          signal: AbortSignal.timeout(120000)
        }
      );

      const genText = await gen.text();

      console.log("WAN GENERATE STATUS:", gen.status, genText.slice(0, 5000));

      if (!gen.ok) {
        res.status(502).json({
          ok: false,
          error: "WAN video generation request failed.",
          details: genText
        });
        return;
      }

      const genData = JSON.parse(genText);

      if (!genData?.event_id) {
        res.status(502).json({
          ok: false,
          error: "WAN did not return an event_id.",
          details: genData
        });
        return;
      }

      const result = await waitForWanResult(genData.event_id);
      const videoUrl = findWanVideoFile(result);

      if (!videoUrl) {
        res.status(502).json({
          ok: false,
          error: "WAN video file was not found.",
          result
        });
        return;
      }

      tempDir = makeTempDir("nova-wan-");

      const output = path.join(tempDir, "nova-wan-video.mp4");

      await downloadToFile(videoUrl, output, {
        headers: hfHeaders(),
        timeout: 180000,
        maxBytes: 100 * 1024 * 1024
      });

      await sendFileStream(
        res,
        output,
        "video/mp4",
        "nova-wan-video.mp4"
      );
    });
  } catch (e) {
    console.error("WAN VIDEO ERROR:", e);

    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: "NOVA WAN video generation server error.",
        details: errorMessage(e)
      });
    } else if (!res.writableEnded) {
      res.destroy(e);
    }
  } finally {
    removeTempDir(tempDir);
  }
});

// ==================== MERGE VIDEO + AUDIO ====================

app.post("/merge-video-audio", async (req, res) => {
  let tempDir = null;

  try {
    await runHeavyJob(async () => {
      const videoBase64 = typeof req.body?.videoBase64 === "string"
        ? req.body.videoBase64
        : "";

      const audioBase64 = typeof req.body?.audioBase64 === "string"
        ? req.body.audioBase64
        : "";

      if (!videoBase64 || !audioBase64) {
        res.status(400).json({
          ok: false,
          error: "videoBase64 and audioBase64 are required."
        });
        return;
      }

      if (
        videoBase64.length > 70 * 1024 * 1024 ||
        audioBase64.length > 42 * 1024 * 1024
      ) {
        res.status(413).json({
          ok: false,
          error: "Video or audio payload is too large."
        });
        return;
      }

      const video = Buffer.from(cleanBase64(videoBase64), "base64");
      const audio = Buffer.from(cleanBase64(audioBase64), "base64");

      if (!video.length || !audio.length) {
        res.status(400).json({
          ok: false,
          error: "Video or audio data is empty."
        });
        return;
      }

      if (
        video.length > 50 * 1024 * 1024 ||
        audio.length > 30 * 1024 * 1024
      ) {
        res.status(413).json({
          ok: false,
          error: "Video or audio exceeds the size limit."
        });
        return;
      }

      tempDir = makeTempDir("nova-merge-");

      const inputVideo = path.join(tempDir, "input-video.mp4");
      const inputAudio = path.join(tempDir, "input-audio.mp3");
      const output = path.join(tempDir, "output-video.mp4");

      fs.writeFileSync(inputVideo, video);
      fs.writeFileSync(inputAudio, audio);

      video.fill(0);
      audio.fill(0);

      await execFileAsync("ffmpeg", [
        "-y",
        "-threads", "1",
        "-i", inputVideo,
        "-i", inputAudio,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "libx264",
        "-threads", "1",
        "-preset", "ultrafast",
        "-crf", "28",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "44100",
        "-shortest",
        "-movflags", "+faststart",
        output
      ], {
        timeout: 240000,
        maxBuffer: 5 * 1024 * 1024
      });

      if (!fs.existsSync(output) || !fs.statSync(output).size) {
        throw new Error("FFmpeg output video was not created.");
      }

      await sendFileStream(
        res,
        output,
        "video/mp4",
        "nova-music-video.mp4"
      );
    });
  } catch (e) {
    console.error("VIDEO + AUDIO MERGE ERROR:", e);

    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: "NOVA video + audio merge server error.",
        details: errorMessage(e)
      });
    } else if (!res.writableEnded) {
      res.destroy(e);
    }
  } finally {
    removeTempDir(tempDir);
  }
});

// ==================== WIKIMEDIA SEARCH ====================

let lastCommonsRequestAt = 0;
let commonsQueue = Promise.resolve();

async function commonsFetch(url) {
  const run = async () => {
    const wait = Math.max(
      0,
      3500 - (Date.now() - lastCommonsRequestAt)
    );

    if (wait) await sleep(wait);

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
      throw new Error(`Wikimedia HTTP ${r.status}: rate limited.`);
    }

    if (!r.ok) {
      throw new Error(`Wikimedia HTTP ${r.status}: ${text.slice(0, 400)}`);
    }

    const data = JSON.parse(text);

    if (data?.error) throw new Error(JSON.stringify(data.error));

    return data;
  };

  const request = commonsQueue.then(run, run);
  commonsQueue = request.catch(() => {});

  return request;
}

async function searchCommonsVideos(query, maxResults = 6) {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srnamespace: "6",
    srlimit: String(Math.min(maxResults, 6)),
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
      size > 60 * 1024 * 1024
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
    await runHeavyJob(async () => {
      console.log("NOVA PREPARE VIDEO REQUEST STARTED");

      const lyrics = typeof req.body?.lyrics === "string"
        ? req.body.lyrics.trim()
        : "";

      const style = typeof req.body?.style === "string"
        ? req.body.style.trim()
        : "Sinematik";

      const visual = typeof req.body?.visualDescription === "string"
        ? req.body.visualDescription.trim()
        : "";

      // Varsayılan test süresi 10 saniye.
      const n = Number(req.body?.duration ?? 10);
      const duration = Math.max(
        1,
        Math.min(180, Number.isFinite(n) && n > 0 ? n : 10)
      );

      const orientation = ["9:16", "16:9", "1:1"].includes(req.body?.orientation)
        ? req.body.orientation
        : "9:16";

      if (!lyrics) {
        res.status(400).json({
          ok: false,
          error: "Şarkı sözleri gerekli."
        });
        return;
      }

      const styleMap = {
        "Sinematik": "cinematic landscape",
        "Duygusal": "sunset landscape",
        "Enerjik": "dance festival",
        "Romantik": "romantic sunset",
        "Karanlık": "dark dramatic",
        "Neon": "neon city",
        "Doğa": "nature landscape",
        "Konser": "live concert"
      };

      const cleanQuery = value => String(value || "")
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 70);

      const query = cleanQuery(visual) ||
        styleMap[style] ||
        "cinematic landscape";

      tempDir = makeTempDir("nova-video-");

      let sources = [];

      try {
        console.log("WIKIMEDIA ARAMA:", query);
        sources = await searchCommonsVideos(query, 6);
        console.log("WIKIMEDIA ARAMA SONUÇ SAYISI:", sources.length);
      } catch (e) {
        console.error("WIKIMEDIA ARAMA HATASI:", errorMessage(e));
      }

      if (!sources.length) {
        console.log("WIKIMEDIA YEDEK VIDEO KAYNAĞI KULLANILACAK");
        sources = [FALLBACK_VIDEO];
      }

      console.log(
        "VIDEO KAYNAKLARI HAZIR. KAYNAK SAYISI:",
        sources.length
      );

      let width = 480;
      let height = 854;

      if (orientation === "16:9") {
        width = 854;
        height = 480;
      }

      if (orientation === "1:1") {
        width = 480;
        height = 480;
      }

      const filter =
        `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1`;

      const segments = [];
      let remaining = duration;

      // Her parça en fazla 5 saniye; tek tek işlenir.
      const maxSegments = Math.ceil(duration / 5) + sources.length;

      for (
        let i = 0;
        i < maxSegments && remaining > 0.01;
        i++
      ) {
        const source = sources[i % sources.length];
        const segDuration = Math.min(5, remaining);
        const inputFile = path.join(tempDir, `source-${i}.video`);
        const segmentFile = path.join(tempDir, `segment-${i}.mp4`);

        try {
          console.log("VIDEO İNDİRİLİYOR:", source.title, source.url);

          await downloadToFile(source.url, inputFile, {
            timeout: 60000,
            maxBytes: 60 * 1024 * 1024
          });

          await execFileAsync("ffmpeg", [
            "-y",
            "-threads", "1",
            "-stream_loop", "-1",
            "-i", inputFile,
            "-t", String(segDuration),
            "-vf", filter,
            "-r", "18",
            "-an",
            "-c:v", "libx264",
            "-threads", "1",
            "-preset", "ultrafast",
            "-crf", "31",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            segmentFile
          ], {
            timeout: 120000,
            maxBuffer: 3 * 1024 * 1024
          });

          if (
            !fs.existsSync(segmentFile) ||
            !fs.statSync(segmentFile).size
          ) {
            throw new Error("FFmpeg boş video parçası oluşturdu.");
          }

          segments.push(segmentFile);
          remaining -= segDuration;

          console.log("VIDEO SEGMENT HAZIR:", i, segDuration);
        } catch (e) {
          console.error(
            "VIDEO SEGMENT HATASI:",
            source.title,
            errorMessage(e)
          );
        } finally {
          try {
            if (fs.existsSync(inputFile)) {
              fs.rmSync(inputFile, { force: true });
            }
          } catch (_) {}
        }
      }

      if (!segments.length || remaining > 0.01) {
        throw new Error(
          `İstenen video süresi tamamlanamadı. Kalan süre: ${remaining.toFixed(1)} saniye.`
        );
      }

      const outputFile = path.join(tempDir, "nova-video.mp4");

      if (segments.length === 1) {
        // Tek parça varsa ikinci FFmpeg işlemi yapılmaz.
        fs.copyFileSync(segments[0], outputFile);
      } else {
        const concatFile = path.join(tempDir, "concat.txt");

        fs.writeFileSync(
          concatFile,
          segments.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"),
          "utf8"
        );

        // Parçalar aynı kodlamayı kullandığı için yeniden kodlamadan birleştir.
        await execFileAsync("ffmpeg", [
          "-y",
          "-threads", "1",
          "-f", "concat",
          "-safe", "0",
          "-i", concatFile,
          "-t", String(duration),
          "-c", "copy",
          "-movflags", "+faststart",
          outputFile
        ], {
          timeout: 120000,
          maxBuffer: 3 * 1024 * 1024
        });
      }

      if (
        !fs.existsSync(outputFile) ||
        !fs.statSync(outputFile).size
      ) {
        throw new Error("FFmpeg son MP4 dosyasını oluşturamadı.");
      }

      const fd = fs.openSync(outputFile, "r");
      const header = Buffer.alloc(12);

      try {
        fs.readSync(fd, header, 0, 12, 0);
      } finally {
        fs.closeSync(fd);
      }

      if (
        fs.statSync(outputFile).size < 12 ||
        header.subarray(4, 8).toString("ascii") !== "ftyp"
      ) {
        throw new Error("Oluşturulan çıktı geçerli bir MP4 dosyası değil.");
      }

      console.log(
        "NOVA MP4 HAZIR:",
        fs.statSync(outputFile).size,
        "bayt"
      );

      await sendFileStream(
        res,
        outputFile,
        "video/mp4",
        "nova-video.mp4"
      );
    });
  } catch (e) {
    console.error("PREPARE VIDEO ERROR:", e?.stack || e);

    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: "NOVA video oluşturma hatası.",
        details: errorMessage(e)
      });
    } else if (!res.writableEnded) {
      res.destroy(e);
    }
  } finally {
    removeTempDir(tempDir);
  }
});

// ==================== SERVER ====================

app.listen(PORT, () => {
  console.log(`NOVA Music Server listening on port ${PORT}`);
});
