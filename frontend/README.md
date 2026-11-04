# MeetingOS web app

React 19 + Vite + Tailwind CSS 4 frontend for [Cognition MeetingOS](../README.md).

```bash
cp .env.example .env   # Firebase web config + VITE_API_URL
npm install
npm run dev            # http://localhost:5174
npm run build
```

Design tokens live in `src/index.css`, shared primitives in `src/components/ui.jsx`. See the root README for the full setup, including dev preview mode with sample data.
