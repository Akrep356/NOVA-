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
app.use(express.json({ limit: "1mb" }));

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
      "POST /prepare-video"
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
    videoEngine: "Wikimedia Commons + FFmpeg"
  });
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
              }
            })
          }
        );

      const responseText =
        await response.text();

      if (!response.ok) {

        console.error(
          "Gemini API error:",
          responseText
        );

        return res.status(
          response.status
        ).json({
          error:
            "Gemini lyrics generation failed.",

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

      } catch (parseError) {

        console.error(
          "Gemini JSON parse error:",
          parseError
        );

        return res.status(500).json({
          error:
            "Invalid response received from Gemini."
        });
      }

      const lyrics =
        data?.candidates?.[0]
          ?.content?.parts
          ?.map(part =>
            typeof part?.text === "string"
              ? part.text
              : ""
          )
          .join("")
          .trim();

      if (!lyrics) {

        return res.status(500).json({
          error:
            "Gemini did not return lyrics."
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
        error:
          "NOVA lyrics generation server error."
      });
    }
  }
);

// =============================================================
// WIKIMEDIA COMMONS VİDEO ARAMA
// =============================================================

async function searchWikimediaVideos(searchText) {

  const url =
    new URL(
      "https://commons.wikimedia.org/w/api.php"
    );

  url.searchParams.set(
    "action",
    "query"
  );

  url.searchParams.set(
    "format",
    "json"
  );

  url.searchParams.set(
    "generator",
    "search"
  );

  url.searchParams.set(
    "gsrsearch",
    searchText
  );

  url.searchParams.set(
    "gsrnamespace",
    "6"
  );

  url.searchParams.set(
    "gsrlimit",
    "20"
  );

  url.searchParams.set(
    "prop",
    "imageinfo"
  );

  url.searchParams.set(
    "iiprop",
    "url|mime|size|mediatype|extmetadata"
  );

  url.searchParams.set(
    "origin",
    "*"
  );

  const response =
    await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "NOVA-App/1.0"
        }
      }
    );

  if (!response.ok) {

    throw new Error(
      `Wikimedia API error: ${response.status}`
    );
  }

  const data =
    await response.json();

  const pages =
    data?.query?.pages
      ? Object.values(
          data.query.pages
        )
      : [];

  const videos =
    pages
      .map(page => {

        const info =
          page?.imageinfo?.[0];

        if (!info) {
          return null;
        }

        const mime =
          typeof info.mime === "string"
            ? info.mime.toLowerCase()
            : "";

        const mediaType =
          typeof info.mediatype === "string"
            ? info.mediatype.toLowerCase()
            : "";

        const fileUrl =
          typeof info.url === "string"
            ? info.url
            : "";

        const isVideo =
          mime.startsWith("video/") ||
          mediaType === "video" ||
          /\.(mp4|webm|ogv|ogg|mov)(\?|$)/i.test(
            fileUrl
          );

        if (!isVideo) {
          return null;
        }

        return {
          title:
            page.title || "Wikimedia video",

          url:
            fileUrl,

          mime:
            mime,

          size:
            Number(info.size || 0),

          descriptionUrl:
            typeof info.descriptionurl === "string"
              ? info.descriptionurl
              : "",

          metadata:
            info.extmetadata || {}
        };

      })
      .filter(Boolean);

  return videos;
}

// =============================================================
// WİKİMEDİA VİDEO İNDİRME
// =============================================================

async function downloadVideo(
  videoUrl,
  destination
) {

  const response =
    await fetch(
      videoUrl,
      {
        headers: {
          "User-Agent":
            "NOVA-App/1.0"
        }
      }
    );

  if (!response.ok) {

    throw new Error(
      `Video download failed: ${response.status}`
    );
  }

  if (!response.body) {

    throw new Error(
      "Video download returned empty body."
    );
  }

  const contentLength =
    Number(
      response.headers.get(
        "content-length"
      ) || 0
    );

  const MAX_DOWNLOAD_SIZE =
    80 * 1024 * 1024;

  if (
    contentLength > MAX_DOWNLOAD_SIZE
  ) {

    throw new Error(
      "Video file is too large."
    );
  }

  await pipeline(
    Readable.fromWeb(
      response.body
    ),
    fs.createWriteStream(
      destination
    )
  );

  const stats =
    fs.statSync(
      destination
    );

  if (
    stats.size <= 0 ||
    stats.size > MAX_DOWNLOAD_SIZE
  ) {

    throw new Error(
      "Downloaded video size is invalid."
    );
  }
}

// =============================================================
// VİDEO ORANI
// =============================================================

function getVideoScaleFilter(
  orientation
) {

  if (orientation === "9:16") {

    return [
      "scale=480:854:force_original_aspect_ratio=increase",
      "crop=480:854",
      "setsar=1"
    ].join(",");
  }

  if (orientation === "16:9") {

    return [
      "scale=854:480:force_original_aspect_ratio=increase",
      "crop=854:480",
      "setsar=1"
    ].join(",");
  }

  return [
    "scale=720:720:force_original_aspect_ratio=increase",
    "crop=720:720",
    "setsar=1"
  ].join(",");
}

// =============================================================
// TEK KLİPTEN VİDEO PARÇASI
// =============================================================

async function createVideoSegment(
  inputFile,
  outputFile,
  duration,
  orientation
) {

  const filter =
    getVideoScaleFilter(
      orientation
    );

  await execFileAsync(
    "ffmpeg",
    [
      "-y",

      "-stream_loop",
      "-1",

      "-i",
      inputFile,

      "-t",
      String(duration),

      "-vf",
      filter,

      "-an",

      "-r",
      "24",

      "-c:v",
      "libx264",

      "-preset",
      "veryfast",

      "-crf",
      "28",

      "-pix_fmt",
      "yuv420p",

      "-movflags",
      "+faststart",

      outputFile
    ],
    {
      maxBuffer:
        10 * 1024 * 1024
    }
  );
}

// =============================================================
// VİDEO BİRLEŞTİRME
// =============================================================

async function concatVideos(
  files,
  outputFile
) {

  const listFile =
    path.join(
      path.dirname(outputFile),
      "concat.txt"
    );

  const content =
    files
      .map(file => {

        const escaped =
          file
            .replace(/'/g, "'\\''");

        return `file '${escaped}'`;

      })
      .join("\n");

  fs.writeFileSync(
    listFile,
    content,
    "utf8"
  );

  try {

    await execFileAsync(
      "ffmpeg",
      [
        "-y",

        "-f",
        "concat",

        "-safe",
        "0",

        "-i",
        listFile,

        "-c",
        "copy",

        "-movflags",
        "+faststart",

        outputFile
      ],
      {
        maxBuffer:
          10 * 1024 * 1024
      }
    );

  } finally {

    try {
      fs.unlinkSync(
        listFile
      );
    } catch (_) {}

  }
}

// =============================================================
// GERÇEK VİDEO ÜRETİMİ
// =============================================================
//
// Pixabay kullanılmaz.
// API anahtarı gerekmez.
//
// Wikimedia Commons:
//   arama
//      ↓
//   video indirme
//      ↓
//   FFmpeg
//      ↓
//   MP4
//
// =============================================================

app.post(
  "/prepare-video",
  async (req, res) => {

    const workDir =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "nova-video-"
        )
      );

    try {

      const lyrics =
        typeof req.body?.lyrics === "string"
          ? req.body.lyrics.trim()
          : "";

      const style =
        typeof req.body?.style === "string"
          ? req.body.style.trim()
          : "Sinematik";

      const requestedDuration =
        Number(
          req.body?.duration ?? 30
        );

      const orientation =
        typeof req.body?.orientation === "string"
          ? req.body.orientation.trim()
          : "9:16";

      const visualDescription =
        typeof req.body?.visualDescription === "string"
          ? req.body.visualDescription.trim()
          : "";

      if (!lyrics) {

        return res.status(400).json({
          error:
            "lyrics is required."
        });
      }

      if (
        ![
          "9:16",
          "16:9",
          "1:1"
        ].includes(
          orientation
        )
      ) {

        return res.status(400).json({
          error:
            "Invalid video orientation."
        });
      }

      const safeDuration =
        Math.max(
          1,
          Math.min(
            180,
            requestedDuration
          )
        );

      // ---------------------------------------------------------
      // Arama kelimelerini oluştur
      // ---------------------------------------------------------

      const styleMap = {
        "Sinematik":
          "cinematic",

        "Duygusal":
          "emotional",

        "Enerjik":
          "concert music",

        "Romantik":
          "romantic",

        "Karanlık":
          "dark night",

        "Neon":
          "neon city",

        "Doğa":
          "nature landscape",

        "Konser":
          "concert performance"
      };

      const styleKeyword =
        styleMap[style] ||
        "cinematic";

      let searchText =
        `${styleKeyword} ${visualDescription}`;

      searchText =
        searchText
          .replace(
            /[^\p{L}\p{N}\s]/gu,
            " "
          )
          .replace(
            /\s+/g,
            " "
          )
          .trim();

      if (!searchText) {
        searchText =
          "cinematic nature";
      }

      // Çok uzun arama sorgusunu sınırla.
      searchText =
        searchText.slice(
          0,
          180
        );

      console.log(
        "WIKIMEDIA VIDEO SEARCH:",
        searchText
      );

      // ---------------------------------------------------------
      // Wikimedia Commons'tan video ara
      // ---------------------------------------------------------

      let videos =
        await searchWikimediaVideos(
          searchText
        );

      // İlk aramada uygun video bulunamazsa
      // daha genel bir arama yap.
      if (
        videos.length === 0
      ) {

        console.log(
          "Specific video search returned no result."
        );

        videos =
          await searchWikimediaVideos(
            styleKeyword
          );
      }

      if (
        videos.length === 0
      ) {

        return res.status(404).json({
          error:
            "Uygun ücretsiz video bulunamadı."
        });
      }

      // En fazla 5 video kullan.
      videos =
        videos.slice(
          0,
          5
        );

      console.log(
        "WIKIMEDIA VIDEOS FOUND:",
        videos.length
      );

      // ---------------------------------------------------------
      // Videoları indir
      // ---------------------------------------------------------

      const downloadedFiles = [];

      for (
        let i = 0;
        i < videos.length;
        i++
      ) {

        const video =
          videos[i];

        const extension =
          video.mime.includes("webm")
            ? "webm"
            : video.mime.includes("ogg")
              ? "ogv"
              : "mp4";

        const destination =
          path.join(
            workDir,
            `source-${i}.${extension}`
          );

        try {

          console.log(
            "DOWNLOADING VIDEO:",
            video.title
          );

          await downloadVideo(
            video.url,
            destination
          );

          downloadedFiles.push({
            file:
              destination,

            source:
              video
          });

        } catch (downloadError) {

          console.error(
            "VIDEO DOWNLOAD ERROR:",
            downloadError.message
          );

          try {
            fs.unlinkSync(
              destination
            );
          } catch (_) {}

        }

      }

      if (
        downloadedFiles.length === 0
      ) {

        return res.status(500).json({
          error:
            "Bulunan videolar indirilemedi."
        });
      }

      // ---------------------------------------------------------
      // Klipleri oluştur
      // ---------------------------------------------------------

      const segmentFiles = [];

      const segmentDuration =
        Math.max(
          5,
          Math.min(
            12,
            Math.ceil(
              safeDuration /
              downloadedFiles.length
            )
          )
        );

      for (
        let i = 0;
        i < downloadedFiles.length;
        i++
      ) {

        const segmentFile =
          path.join(
            workDir,
            `segment-${i}.mp4`
          );

        try {

          await createVideoSegment(
            downloadedFiles[i].file,
            segmentFile,
            segmentDuration,
            orientation
          );

          segmentFiles.push(
            segmentFile
          );

        } catch (segmentError) {

          console.error(
            "VIDEO SEGMENT ERROR:",
            segmentError.message
          );

        }

      }

      if (
        segmentFiles.length === 0
      ) {

        return res.status(500).json({
          error:
            "Video klipleri oluşturulamadı."
        });
      }

      // ---------------------------------------------------------
      // Birleştir
      // ---------------------------------------------------------

      let combinedFile =
        path.join(
          workDir,
          "combined.mp4"
        );

      await concatVideos(
        segmentFiles,
        combinedFile
      );

      // ---------------------------------------------------------
      // Nihai süreyi tam olarak ayarla
      // ---------------------------------------------------------

      const finalFile =
        path.join(
          workDir,
          "nova-video.mp4"
        );

      await execFileAsync(
        "ffmpeg",
        [
          "-y",

          "-i",
          combinedFile,

          "-t",
          String(safeDuration),

          "-an",

          "-c:v",
          "libx264",

          "-preset",
          "veryfast",

          "-crf",
          "28",

          "-pix_fmt",
          "yuv420p",

          "-movflags",
          "+faststart",

          finalFile
        ],
        {
          maxBuffer:
            10 * 1024 * 1024
        }
      );

      // ---------------------------------------------------------
      // Sonucu kontrol et
      // ---------------------------------------------------------

      if (
        !fs.existsSync(
          finalFile
        )
      ) {

        return res.status(500).json({
          error:
            "Final MP4 oluşturulamadı."
        });
      }

      const finalStats =
        fs.statSync(
          finalFile
        );

      if (
        finalStats.size <= 0
      ) {

        return res.status(500).json({
          error:
            "Final MP4 boş."
        });
      }

      console.log(
        "NOVA VIDEO CREATED:",
        finalStats.size,
        "bytes"
      );

      // ---------------------------------------------------------
      // Kaynak bilgilerini logla
      // ---------------------------------------------------------

      console.log(
        "VIDEO SOURCES:"
      );

      for (
        const item of downloadedFiles
      ) {

        console.log(
          "-",
          item.source.title,
          item.source.url
        );

      }

      // ---------------------------------------------------------
      // MP4'ü Android'e gönder
      // ---------------------------------------------------------

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

      return res.sendFile(
        finalFile
      );

    } catch (error) {

      console.error(
        "VIDEO GENERATION ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "NOVA video generation server error.",

        details:
          error.message
      });

    } finally {

      // ---------------------------------------------------------
      // Render'ın geçici diskini temizle
      // ---------------------------------------------------------

      setTimeout(
        () => {

          try {

            fs.rmSync(
              workDir,
              {
                recursive: true,
                force: true
              }
            );

            console.log(
              "NOVA temporary video files deleted."
            );

          } catch (cleanupError) {

            console.error(
              "VIDEO CLEANUP ERROR:",
              cleanupError.message
            );

          }

        },
        5000
      );

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
