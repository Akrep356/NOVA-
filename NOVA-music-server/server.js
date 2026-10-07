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
      "POST /prepare-video",
      "GET /wan-api-test"
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
        "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space/gradio_api/info"
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

async function searchWikimediaVideos(
  searchText
) {

  const cleanText =
    String(searchText || "")
      .replace(
        /[^\p{L}\p{N}\s]/gu,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
      .slice(0, 180);

  const queryText =
    `${cleanText} filetype:video`
      .trim();

  console.log(
    "WIKIMEDIA SEARCH QUERY:",
    queryText
  );

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
    "formatversion",
    "2"
  );

  url.searchParams.set(
    "generator",
    "search"
  );

  url.searchParams.set(
    "gsrsearch",
    queryText
  );

  url.searchParams.set(
    "gsrnamespace",
    "6"
  );

  url.searchParams.set(
    "gsrlimit",
    "50"
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
            "NOVA-App/1.0 (video generator)"
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
    Array.isArray(
      data?.query?.pages
    )
      ? data.query.pages
      : [];

  const MAX_DOWNLOAD_SIZE =
    80 * 1024 * 1024;

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

        const title =
          typeof page.title === "string"
            ? page.title
            : "Wikimedia video";

        const size =
          Number(
            info.size || 0
          );

        const isVideo =
          mime.startsWith("video/") ||
          mediaType === "video" ||
          mediaType === "multimedia" ||
          /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|$)/i.test(
            fileUrl
          );

        if (!isVideo) {
          return null;
        }

        if (!fileUrl) {
          return null;
        }

        if (
          size > MAX_DOWNLOAD_SIZE
        ) {
          console.log(
            "SKIPPING LARGE VIDEO:",
            title,
            size
          );

          return null;
        }

        return {
          title:
            title,

          url:
            fileUrl,

          mime:
            mime,

          size:
            size,

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
// VİDEO UZANTISI
// =============================================================

function getVideoExtension(
  video
) {

  const mime =
    String(
      video?.mime || ""
    ).toLowerCase();

  const fileUrl =
    String(
      video?.url || ""
    );

  if (
    mime.includes("webm") ||
    /\.webm(\?|$)/i.test(fileUrl)
  ) {
    return "webm";
  }

  if (
    mime.includes("ogg") ||
    /\.ogv(\?|$)/i.test(fileUrl) ||
    /\.ogg(\?|$)/i.test(fileUrl)
  ) {
    return "ogv";
  }

  if (
    mime.includes("quicktime") ||
    /\.mov(\?|$)/i.test(fileUrl)
  ) {
    return "mov";
  }

  if (
    mime.includes("mp4") ||
    /\.mp4(\?|$)/i.test(fileUrl) ||
    /\.m4v(\?|$)/i.test(fileUrl)
  ) {
    return "mp4";
  }

  return "mp4";
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
            "NOVA-App/1.0 (video generator)"
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

  if (
    orientation === "9:16"
  ) {

    return [
      "scale=480:854:force_original_aspect_ratio=increase",
      "crop=480:854",
      "setsar=1"
    ].join(",");
  }

  if (
    orientation === "16:9"
  ) {

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
            .replace(
              /'/g,
              "'\\''"
            );

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
// VİDEO ARAMA SIRASI
// =============================================================

function buildVideoSearchQueries(
  style,
  styleKeyword,
  visualDescription
) {

  const queries = [];

  const visual =
    String(
      visualDescription || ""
    )
      .replace(
        /[^\p{L}\p{N}\s]/gu,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  const styleText =
    String(
      styleKeyword || "cinematic"
    )
      .replace(
        /[^\p{L}\p{N}\s]/gu,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (visual) {

    queries.push(
      `${visual} ${styleText}`
    );

    queries.push(
      visual
    );
  }

  if (styleText) {
    queries.push(
      styleText
    );
  }

  const fallbackMap = {

    "Sinematik": [
      "cinematic",
      "city",
      "landscape",
      "nature",
      "film"
    ],

    "Duygusal": [
      "emotional",
      "sunset",
      "rain",
      "nature",
      "people"
    ],

    "Enerjik": [
      "concert",
      "music",
      "dance",
      "festival",
      "crowd"
    ],

    "Romantik": [
      "romantic",
      "couple",
      "sunset",
      "love",
      "city"
    ],

    "Karanlık": [
      "dark",
      "night",
      "rain",
      "city",
      "storm"
    ],

    "Neon": [
      "neon",
      "night city",
      "city",
      "lights",
      "night"
    ],

    "Doğa": [
      "nature",
      "landscape",
      "forest",
      "mountain",
      "ocean"
    ],

    "Konser": [
      "concert",
      "live music",
      "music festival",
      "stage",
      "crowd"
    ]
  };

  const fallbackQueries =
    fallbackMap[style] ||
    [
      "cinematic",
      "nature",
      "city",
      "landscape",
      "concert"
    ];

  for (
    const query of fallbackQueries
  ) {

    queries.push(
      query
    );

  }

  return [
    ...new Set(
      queries
        .map(
          item =>
            String(item)
              .trim()
        )
        .filter(Boolean)
    )
  ];
}

// =============================================================
// GERÇEK VİDEO ÜRETİMİ
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

      const searchQueries =
        buildVideoSearchQueries(
          style,
          styleKeyword,
          visualDescription
        );

      console.log(
        "WIKIMEDIA SEARCH PLAN:",
        searchQueries
      );

      let videos = [];

      for (
        const query of searchQueries
      ) {

        try {

          console.log(
            "TRYING VIDEO SEARCH:",
            query
          );

          const results =
            await searchWikimediaVideos(
              query
            );

          console.log(
            "SEARCH RESULT COUNT:",
            results.length
          );

          if (
            results.length > 0
          ) {

            videos =
              results;

            break;
          }

        } catch (searchError) {

          console.error(
            "WIKIMEDIA SEARCH ERROR:",
            searchError.message
          );

        }

      }

      if (
        videos.length === 0
      ) {

        return res.status(404).json({
          error:
            "Uygun ücretsiz video bulunamadı. Wikimedia Commons üzerinde uygun video bulunamadı."
        });
      }

      videos =
        videos
          .filter(
            video =>
              video &&
              video.url
          )
          .slice(
            0,
            5
          );

      console.log(
        "WIKIMEDIA VIDEOS SELECTED:",
        videos.length
      );

      const downloadedFiles = [];

      for (
        let i = 0;
        i < videos.length;
        i++
      ) {

        const video =
          videos[i];

        const extension =
          getVideoExtension(
            video
          );

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
            video.title,
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

        console.log(
          "FIRST VIDEO DOWNLOAD ROUND FAILED."
        );

        const emergencyQueries = [
          "city",
          "nature",
          "landscape",
          "night",
          "concert"
        ];

        for (
          const query of emergencyQueries
        ) {

          try {

            const emergencyVideos =
              await searchWikimediaVideos(
                query
              );

            for (
              const video of emergencyVideos
            ) {

              if (
                downloadedFiles.length >= 3
              ) {
                break;
              }

              const index =
                downloadedFiles.length;

              const extension =
                getVideoExtension(
                  video
                );

              const destination =
                path.join(
                  workDir,
                  `emergency-${index}.${extension}`
                );

              try {

                console.log(
                  "EMERGENCY DOWNLOAD:",
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

              } catch (emergencyDownloadError) {

                console.error(
                  "EMERGENCY DOWNLOAD ERROR:",
                  emergencyDownloadError.message
                );

                try {

                  fs.unlinkSync(
                    destination
                  );

                } catch (_) {}

              }

            }

            if (
              downloadedFiles.length > 0
            ) {
              break;
            }

          } catch (emergencySearchError) {

            console.error(
              "EMERGENCY SEARCH ERROR:",
              emergencySearchError.message
            );

          }

        }
      }

      if (
        downloadedFiles.length === 0
      ) {

        return res.status(500).json({
          error:
            "Bulunan ücretsiz videolar indirilemedi."
        });
      }

      console.log(
        "DOWNLOADABLE VIDEOS:",
        downloadedFiles.length
      );

      const segmentFiles = [];

      const segmentDuration =
        safeDuration <= 10
          ? safeDuration
          : 10;

      let remainingDuration =
        safeDuration;

      let segmentIndex =
        0;

      let sourceIndex =
        0;

      while (
        remainingDuration > 0
      ) {

        const source =
          downloadedFiles[
            sourceIndex %
            downloadedFiles.length
          ];

        const currentDuration =
          Math.min(
            segmentDuration,
            remainingDuration
          );

        const segmentFile =
          path.join(
            workDir,
            `segment-${segmentIndex}.mp4`
          );

        try {

          console.log(
            "CREATING SEGMENT:",
            segmentIndex,
            "duration:",
            currentDuration,
            "source:",
            source.source.title
          );

          await createVideoSegment(
            source.file,
            segmentFile,
            currentDuration,
            orientation
          );

          segmentFiles.push(
            segmentFile
          );

          remainingDuration -=
            currentDuration;

          segmentIndex++;
          sourceIndex++;

        } catch (segmentError) {

          console.error(
            "VIDEO SEGMENT ERROR:",
            segmentError.message
          );

          sourceIndex++;

          if (
            sourceIndex >
            downloadedFiles.length * 3 &&
            segmentFiles.length === 0
          ) {

            break;
          }

        }

        if (
          segmentIndex > 60
        ) {
          break;
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

      console.log(
        "VIDEO SEGMENTS CREATED:",
        segmentFiles.length
      );

      const combinedFile =
        path.join(
          workDir,
          "combined.mp4"
        );

      await concatVideos(
        segmentFiles,
        combinedFile
      );

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
        120000
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
