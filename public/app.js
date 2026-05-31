const form = document.getElementById("book-form");
const statusEl = document.getElementById("form-status");
const errorEl = document.getElementById("form-error");
const cardsEl = document.getElementById("concept-cards");
const warningsEl = document.getElementById("warnings");
const apiBase = window.location.protocol.startsWith("http")
  ? window.location.origin
  : "http://localhost:3002";

const demoPresets = {
  literary: {
    title: "The Orchard of Quiet Names",
    genre: "Literary Fiction",
    synopsis:
      "A widowed botanist returns to her coastal hometown to settle her mother's estate. As she restores an abandoned orchard, she unearths letters that reveal a hidden chapter of her family's history, forcing her to reconcile grief, love, and the secrets embedded in the land.",
    audience:
      "Readers who love lyrical, character-driven stories about memory, place, and quiet resilience.",
  },
  thriller: {
    title: "Zero Hour Protocol",
    genre: "Tech Thriller",
    synopsis:
      "An ethical hacker discovers a dormant algorithm inside a smart-city grid that can trigger citywide blackouts. With a rogue security contractor hunting her, she must decode the system's origin while racing against a countdown that threatens millions.",
    audience:
      "Fans of fast-paced thrillers with high-stakes technology, tight pacing, and cinematic tension.",
  },
  nonfiction: {
    title: "The Attention Architect",
    genre: "Non-Fiction / Productivity",
    synopsis:
      "A neuroscientist-turned-coach reveals how attention can be trained like a muscle. Through research, interviews, and step-by-step frameworks, the book shows how to reclaim focus in a distraction economy and build sustainable creative habits.",
    audience:
      "Professionals, creators, and students looking for evidence-based strategies to improve focus and productivity.",
  },
};

function setStatus(message, isError) {
  statusEl.textContent = message || "";
  statusEl.style.color = isError ? "#8b2f24" : "#5b4a40";
}

function setError(message) {
  errorEl.textContent = message || "";
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function createSection(labelText, bodyClass) {
  const section = document.createElement("div");
  section.className = "section";

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = labelText;

  const body = document.createElement("div");
  if (bodyClass) body.className = bodyClass;

  section.append(label, body);

  return { section, body };
}

function renderWarnings(warnings) {
  warningsEl.textContent = "";
  if (!warnings || warnings.length === 0) return;
  warningsEl.textContent = warnings.join(" ");
}

function renderConcepts(concepts) {
  cardsEl.innerHTML = "";

  concepts.forEach((concept, index) => {
    const card = document.createElement("article");
    card.className = "card";
    card.style.animationDelay = `${index * 0.08}s`;

    const title = document.createElement("h3");
    title.textContent = `Concept ${index + 1}`;
    card.appendChild(title);

    const descriptionSection = createSection("Description");
    descriptionSection.body.textContent = concept.description || "";
    card.appendChild(descriptionSection.section);

    const styleSection = createSection("Visual Style");
    styleSection.body.textContent = concept.visualStyle || "";
    card.appendChild(styleSection.section);

    const paletteSection = createSection("Color Palette");
    const palette = document.createElement("div");
    palette.className = "palette";
    (concept.colorPalette || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((color) => {
        const chip = document.createElement("span");
        chip.textContent = color;
        palette.appendChild(chip);
      });
    paletteSection.section.removeChild(paletteSection.body);
    paletteSection.section.appendChild(palette);
    card.appendChild(paletteSection.section);

    const promptSection = createSection("Image Prompt", "prompt");
    promptSection.body.textContent = concept.imagePrompt || "";
    card.appendChild(promptSection.section);

    const blurbSection = createSection("Back-Cover Blurb", "blurb");
    blurbSection.body.textContent = concept.blurb || "";
    const wordCount = document.createElement("div");
    wordCount.className = "word-count";
    wordCount.textContent = `${countWords(concept.blurb || "")} words`;
    blurbSection.section.appendChild(wordCount);
    card.appendChild(blurbSection.section);

    cardsEl.appendChild(card);
  });
}

function fillForm(preset) {
  form.title.value = preset.title;
  form.genre.value = preset.genre;
  form.synopsis.value = preset.synopsis;
  form.audience.value = preset.audience;
}

Array.from(document.querySelectorAll("[data-demo]")).forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.demo;
    if (demoPresets[key]) {
      fillForm(demoPresets[key]);
      setStatus(`Loaded ${button.textContent} preset.`);
      setError("");
    }
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");
  setStatus("Generating concepts...");
  warningsEl.textContent = "";
  cardsEl.innerHTML = "";

  const payload = {
    title: form.title.value,
    genre: form.genre.value,
    synopsis: form.synopsis.value,
    audience: form.audience.value,
  };

  try {
    const response = await fetch(`${apiBase}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let data = {};

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch (parseError) {
        throw new Error("Server returned a non-JSON response.");
      }
    }

    if (!response.ok) {
      const details = Array.isArray(data.details)
        ? ` ${data.details.join(" ")}`
        : data.details
          ? ` ${data.details}`
          : "";
      const fallbackMessage = rawText
        ? `Request failed: ${rawText}`
        : `Request failed (${response.status}).`;
      throw new Error(`${data.error || fallbackMessage}${details}`);
    }

    renderWarnings(data.warnings);
    renderConcepts(data.concepts || []);
    setStatus("Concepts ready.");
  } catch (err) {
    setStatus("", true);
    setError(err.message || "Something went wrong.");
  }
});
