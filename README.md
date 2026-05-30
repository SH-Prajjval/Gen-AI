# Coverforge Studio

Generate three professional book cover concepts, image prompts, and back-cover blurbs from a title, genre, synopsis, and target audience.

## Requirements

- Node.js 20+
- A Gemini API key

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and add your `GEMINI_API_KEY`.
3. Start the server: `npm run dev`
4. Open the app in your browser on localhost port 3000.

## Usage

- Fill in the book metadata form or click a demo preset.
- Generate results to receive 3 distinct cover concepts with prompts and blurbs.

## Environment Variables

- `GEMINI_API_KEY`: your Gemini API key (required)
- `GEMINI_MODEL`: optional; defaults to `gemini-1.5-flash-latest`
- `PORT`: optional; defaults to 3000
