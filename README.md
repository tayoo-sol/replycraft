# ReplyCraft — Private Reply Studio

Short, sensitive replies are written **on-device by Gemini Nano** — they never leave your device.
Long, complex drafts go to **Gemini Flash in the cloud**. Every reply shows exactly where it was made.

Built for the Google/Firebase **#BuildHybridAI 2026** hackathon with
[Firebase AI Logic](https://firebase.google.com/docs/ai-logic) hybrid inference.

## How it works

- Paste a received message (or pick one of the four samples, in English or Bahasa Indonesia).
- Choose tone (Friendly / Professional / Concise / Apologetic), reply length
  (Short / Medium / Detailed), and reply language (English / Bahasa Indonesia).
- Click **Generate reply**.
- Short input + Short/Medium length → on-device model (`PREFER_ON_DEVICE`).
  Input over 1,500 characters or Detailed length → cloud model (`PREFER_IN_CLOUD`).
  The routing decision is shown in plain language, and every reply carries a badge
  from `response.inferenceSource` — **On-device · Gemini Nano** or **Cloud · Gemini Flash** —
  plus the time it took.

On-device inference needs desktop Chrome with Gemini Nano downloaded.
Without it, the app simply uses the cloud, so it works in any modern browser.

## Run it locally

```bash
npm install
npm run dev
```

### App Check (local development)

AI Logic calls are protected by Firebase App Check. For local development, create a
debug token in the Firebase console (App Check → Apps → your web app → Manage debug
tokens) and put it in a `.env.local` file — never commit it:

```bash
VITE_APPCHECK_DEBUG_TOKEN=your-debug-token-here
```

The hosted site uses reCAPTCHA Enterprise instead (registered in Firebase App Check).

## Production build

```bash
npm run build   # outputs to dist/
```

## Tech

- Vite + React
- Firebase AI Logic (`firebase/ai`, Gemini Developer API backend)
- Firebase App Check

## License

Apache License 2.0 — see `LICENSE`.
