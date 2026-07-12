# Corte — Template Tweet + Admin

Web app that drops a video inside an **X/Twitter-style post card** (editable avatar, name, @handle, verified badge, caption and a top "hook" band) and renders it as a ready-to-post 9:16 video — a single clip or a whole batch. Includes **Firebase login** and a full **admin panel** that tracks who connects (IP, operating system, browser, device, geolocation, sessions) and lets an admin moderate users.

Replicates the "Template" feature of the local *Video Cortes* app as a cloud service, with the admin/session-tracking system adapted from the *tres6zero* project.

## Monorepo layout

```
corte/
├── apps/
│   ├── web/      # React 18 + Vite + TS + Tailwind  → Vercel
│   └── server/   # Node + Express + firebase-admin + sharp + ffmpeg  → Render
├── render.yaml   # Render blueprint (backend)
└── package.json  # npm workspaces
```

## Features

- **Template Tweet** (`/criar/template`): upload/drag videos or paste a link, pick a profile, edit captions per clip, live **server-rendered preview** (a real frame from the same pipeline), then generate. Profiles saved in localStorage; avatars + clips on the server.
- **Auth**: Firebase email/password + Google. Protected routes; role-based admin route.
- **Admin** (`/admin`, admins only): overview stats, OS chart, logins-per-day, recent logins (IP · SO · local), a searchable users table, and a per-user drawer with **login history, devices/IPs, and moderation** (change role, ban/unban, suspend/reactivate, delete, internal notes).
- **Session tracking**: every login records IP (`x-forwarded-for`), OS/browser/device (`ua-parser-js`), and geolocation (edge headers → `ipapi.co`) into Firestore; device ids are hashed with a server pepper.

## Local development

```bash
npm install                     # installs both workspaces

# apps/server/.env  — copy from .env.example and fill FIREBASE_SERVICE_ACCOUNT_B64
# apps/web/.env     — copy from .env.example (VITE_API_URL=http://localhost:4000)

npm run dev                     # server on :4000 + web on :5173
```

Generate the base64 service account for the server env:
```bash
node -e "console.log(Buffer.from(require('fs').readFileSync('serviceAccount.json')).toString('base64'))"
```

Grant admin to a user (besides the bootstrap `ADMIN_EMAILS`):
```bash
npm run set-admin -- someone@example.com          # or: ... support | user
```

## Firebase setup (one-time, in the Firebase console for project `corte-69134`)

1. **Authentication → Sign-in method**: enable **Email/Password** and **Google**.
2. **Firestore Database**: create a database (production mode is fine — the backend uses the Admin SDK, which bypasses security rules).
3. **Authentication → Settings → Authorized domains**: add your Vercel domain.

## Deploy

### Backend → Render
1. Push this repo to GitHub.
2. Render → **New → Blueprint** → select the repo (uses `render.yaml`).
3. Set the secret env vars: `FIREBASE_SERVICE_ACCOUNT_B64` (base64 of the service account), `CORS_ORIGINS` (your Vercel URL). `DEVICE_HASH_SECRET` is auto-generated.
4. Deploy → note the URL, e.g. `https://corte-api.onrender.com`.

### Frontend → Vercel
1. Vercel → **Add New → Project** → import the repo, **Root Directory = `apps/web`**.
2. Env var: `VITE_API_URL=https://corte-api.onrender.com` (the Render URL). Firebase `VITE_*` values have safe public defaults but can be overridden.
3. Deploy. Then add the Vercel URL to Render's `CORS_ORIGINS` and to Firebase authorized domains.

## Notes / roadmap
- Uploaded videos and rendered clips live on the server's **ephemeral disk** (fine for generate-then-download; add object storage for persistence).
- Link/profile import uses **yt-dlp** if present on the server (`YTDLP_PATH`); file upload always works.
- Emoji in captions need an emoji font on the render host (bundle Noto Color Emoji to enable).
- The Render free plan cold-starts after inactivity.
