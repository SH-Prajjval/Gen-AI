const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const {
  GoogleGenerativeAI,
  SchemaType: GeminiSchemaType,
} = require("@google/generative-ai");

dotenv.config();

const SchemaType = GeminiSchemaType || {
  OBJECT: "object",
  ARRAY: "array",
  STRING: "string",
  NUMBER: "number",
};

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
const fallbackModels = ["gemini-1.5-flash-latest", "gemini-1.5-pro-latest"];
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    concepts: {
      type: SchemaType.ARRAY,
      minItems: 3,
      maxItems: 3,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          description: { type: SchemaType.STRING },
          visualStyle: { type: SchemaType.STRING },
          colorPalette: { type: SchemaType.STRING },
          imagePrompt: { type: SchemaType.STRING },
          blurb: { type: SchemaType.STRING },
        },
        required: [
          "description",
          "visualStyle",
          "colorPalette",
          "imagePrompt",
          "blurb",
        ],
      },
    },
  },
  required: ["concepts"],
};

let cachedModels = null;
let cachedModelsAt = 0;

function normalizeInput(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function validatePayload(payload) {
  const errors = [];
  const title = normalizeInput(payload.title);
  const genre = normalizeInput(payload.genre);
  const synopsis = normalizeInput(payload.synopsis);
  const audience = normalizeInput(payload.audience);

  if (title.length < 2) errors.push("Title must be at least 2 characters.");
  if (genre.length < 2) errors.push("Genre must be at least 2 characters.");
  if (synopsis.length < 40)
    errors.push("Synopsis must be at least 40 characters.");
  if (synopsis.length > 2000)
    errors.push("Synopsis must be under 2000 characters.");
  if (audience.length < 2)
    errors.push("Target audience must be at least 2 characters.");

  return {
    errors,
    data: { title, genre, synopsis, audience },
  };
}

function buildPrompt({ title, genre, synopsis, audience }) {
  return [
    "You are a professional book cover art director and copywriter.",
    "Create 3 distinct cover concepts for the book details below.",
    "Return only valid JSON that matches the response schema.",
    "Each concept must include:",
    "- description: high-level cover concept",
    "- visualStyle: typography, illustration/photography, layout cues",
    "- colorPalette: 3 to 6 colors as comma-separated names",
    "- imagePrompt: a single paragraph prompt ready for image generation",
    "- blurb: a compelling back-cover blurb about 150 words",
    "Rules:",
    "- Keep blurbs close to 150 words (avoid bullet points).",
    "- Make each concept meaningfully different in mood and visuals.",
    "- Do not mention you are an AI.",
    "- Do not include markdown or extra keys.",
    "",
    `Title: ${title}`,
    `Genre: ${genre}`,
    `Synopsis: ${synopsis}`,
    `Target Audience: ${audience}`,
  ].join("\n");
}

function buildGenerationConfig(useSchema) {
  const config = {
    temperature: 0.8,
    responseMimeType: "application/json",
  };

  if (useSchema) {
    config.responseSchema = responseSchema;
  }

  return config;
}

async function listAvailableModels() {
  const cacheWindowMs = 10 * 60 * 1000;
  if (cachedModels && Date.now() - cachedModelsAt < cacheWindowMs) {
    return cachedModels;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );

  if (!response.ok) {
    throw new Error(`Model list request failed with ${response.status}.`);
  }

  const data = await response.json();
  cachedModels = Array.isArray(data.models) ? data.models : [];
  cachedModelsAt = Date.now();
  return cachedModels;
}

function getModelNames() {
  return Array.from(new Set([modelName, ...fallbackModels]));
}

function isTextModel(name) {
  const lower = name.toLowerCase();
  if (lower.includes("image")) return false;
  if (lower.includes("vision")) return false;
  if (lower.includes("embed")) return false;
  if (lower.includes("audio")) return false;
  if (lower.includes("tts")) return false;
  return true;
}

function isStableModel(name) {
  return !/preview|experimental|exp|computer-use/i.test(name);
}

async function generateWithModel(modelId, prompt, useSchema) {
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: buildGenerationConfig(useSchema),
  });

  const result = await model.generateContent(prompt);
  return { text: result.response.text(), modelId };
}

async function tryGenerate(modelId, prompt) {
  try {
    return await generateWithModel(modelId, prompt, true);
  } catch (err) {
    const message = String(err.message || err);
    if (/responseSchema|response schema|response_mime_type/i.test(message)) {
      return await generateWithModel(modelId, prompt, false);
    }
    throw err;
  }
}

async function generateWithFallback(prompt) {
  let lastError;

  for (const candidate of getModelNames()) {
    try {
      return await tryGenerate(candidate, prompt);
    } catch (err) {
      lastError = err;
      const message = String(err.message || err);
      if (
        err.status === 404 ||
        err.status === 403 ||
        err.status === 429 ||
        /not found|not supported|denied access|forbidden|quota|rate limit/i.test(
          message,
        )
      ) {
        continue;
      }
      throw err;
    }
  }

  if (lastError) {
    const message = String(lastError.message || lastError);
    if (lastError.status === 404 || /not found|not supported/i.test(message)) {
      const models = await listAvailableModels();
      const candidates = models
        .filter((model) =>
          Array.isArray(model.supportedGenerationMethods)
            ? model.supportedGenerationMethods.includes("generateContent")
            : false,
        )
        .map((model) => model.name.replace(/^models\//, ""))
        .filter(isTextModel);

      const stableCandidates = candidates.filter(isStableModel);
      const selectedCandidates = stableCandidates.length
        ? stableCandidates
        : candidates;

      const geminiCandidates = selectedCandidates.filter((name) =>
        /gemini/i.test(name),
      );
      const finalCandidates = geminiCandidates.length
        ? geminiCandidates
        : selectedCandidates;

      const scoredCandidates = finalCandidates
        .map((name) => {
          let score = 0;
          if (/1\.5/.test(name)) score += 4;
          if (/1\.0/.test(name)) score += 3;
          if (/flash/i.test(name)) score += 2;
          if (/pro/i.test(name)) score += 1;
          if (/2\./.test(name)) score -= 1;
          return { name, score };
        })
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.name);

      for (const candidate of scoredCandidates) {
        try {
          return await tryGenerate(candidate, prompt);
        } catch (err) {
          lastError = err;
          const candidateMessage = String(err.message || err);
          if (
            err.status === 404 ||
            err.status === 403 ||
            err.status === 429 ||
            /not found|not supported/i.test(candidateMessage)
          ) {
            continue;
          }
          if (
            /denied access|forbidden|quota|rate limit/i.test(candidateMessage)
          ) {
            continue;
          }
          throw err;
        }
      }
    }
  }

  throw lastError;
}

app.post("/api/generate", async (req, res) => {
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not set." });
  }

  const { errors, data } = validatePayload(req.body || {});
  if (errors.length) {
    return res.status(400).json({ error: "Invalid input", details: errors });
  }

  try {
    const { text, modelId } = await generateWithFallback(buildPrompt(data));
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      return res.status(502).json({
        error: "Model returned invalid JSON.",
        raw: text.slice(0, 2000),
      });
    }

    const concepts = Array.isArray(parsed.concepts)
      ? parsed.concepts.slice(0, 3)
      : [];
    if (concepts.length !== 3) {
      return res
        .status(502)
        .json({ error: "Model did not return 3 concepts." });
    }

    const warnings = concepts
      .map((concept, index) => {
        const count = countWords(concept.blurb);
        if (count < 130 || count > 170) {
          return `Concept ${index + 1} blurb is ${count} words (target ~150).`;
        }
        return null;
      })
      .filter(Boolean);

    return res.json({ concepts, warnings, modelUsed: modelId });
  } catch (err) {
    console.error("Gemini generation error:", err);
    return res.status(500).json({
      error: "Generation failed",
      details: String(err.message || err),
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
