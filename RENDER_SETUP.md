# Render Free setup (experimental)

This is a modified copy of tacheometry/steam-hour-farmer. It does **not** guarantee 24/7 operation. The original license is retained.

## GitHub
Upload these files to your **private fork** (replace `index.js` and add this guide). Do not commit `.env`, credentials, Steam Guard codes, refresh tokens, or Shared Secret.

## Render
- New > Web Service > Connect your GitHub fork
- Runtime: Node
- Build command: `npm ci`
- Start command: `npm start`
- Free instance (if available)
- Health check path: `/health`
- Environment (secret values):
  - `ACCOUNT_NAME`: Steam account login name
  - `PASSWORD`: Steam account password
  - `GAMES`: `381210` (Dead by Daylight)
  - `PERSONA`: `1` (optional)
  - `STEAM_GUARD_CODE`: fresh 5-character mobile authenticator code **only when prompted**. Set in Render Environment, redeploy promptly, then remove this variable after successful authentication. Codes expire quickly; this method may fail if deployment is slow.

## Monitoring
`https://YOUR-SERVICE.onrender.com/health` returns HTTP 200 only while Steam is connected and 503 otherwise. An HTTP 200 does not prove Steam playtime has incremented.

## Important limitations
- Render Free can sleep, restart or lose ephemeral Steam session files.
- Steam mobile confirmation/push approval is **not** implemented; this version only supports a manually entered fresh authenticator code via environment variable.
- After restart, Steam may require another code. This is not unattended 24/7.
- Do not disable Steam Guard or export the authenticator Shared Secret to make this work.
- Test using an account you are comfortable using with third-party code; read the source and dependencies before providing credentials.
