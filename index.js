
"use strict";

const http = require("http");
const Steam = require("steam-user");
require("dotenv").config();

const {
  ACCOUNT_NAME,
  PASSWORD,
  REFRESH_TOKEN,
  PERSONA,
  GAMES,
  STEAM_GUARD_CODE,
} = process.env;

if (!GAMES || (!REFRESH_TOKEN && (!ACCOUNT_NAME || !PASSWORD))) {
  console.error("Set GAMES and either REFRESH_TOKEN or both ACCOUNT_NAME and PASSWORD.");
  process.exit(1);
}

const games = GAMES.split(",").map((s) => s.trim()).filter(Boolean).map((s) => /^\d+$/.test(s) ? Number(s) : s);
const persona = PERSONA === undefined ? undefined : Number(PERSONA);
const user = new Steam({
  machineIdType: Steam.EMachineIDType.PersistentRandom,
  dataDirectory: "SteamData",
  renewRefreshTokens: true,
});

let authenticated = false;
let playingOnOtherSession = false;
let lastLogOnTime = 0;
let retryAfter = 0;
let lastGameRefreshTime = 0;
let currentNotification;
let token = REFRESH_TOKEN || null;

const port = Number(process.env.PORT || 10000);
http.createServer((req, res) => {
  if (req.url !== "/health") {
    res.writeHead(404);
    return res.end("Not found");
  }
  res.writeHead(authenticated ? 200 : 503, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ steamConnected: authenticated }));
}).listen(port, "0.0.0.0", () => console.log(`Health endpoint listening on ${port}`));

function logOn() {
  if (authenticated || Date.now() - lastLogOnTime < 60_000 || Date.now() < retryAfter) return;
  lastLogOnTime = Date.now();
  console.log(`Logging in using ${token ? "refresh token" : "password"}...`);
  const options = token
    ? { refreshToken: token }
    : {
        accountName: ACCOUNT_NAME,
        password: PASSWORD,
        twoFactorCode: STEAM_GUARD_CODE || undefined,
      };
  user.logOn({
    ...options,
    machineName: "steam-hour-farmer",
    clientOS: Steam.EOSType.Windows10,
    autoRelogin: true,
  });
}

function refreshGames() {
  if (!authenticated) return;
  const notification = playingOnOtherSession ? "Farming is paused." : "Farming...";
  if (!playingOnOtherSession && Date.now() - lastGameRefreshTime > 60_000) {
    user.gamesPlayed(games);
    lastGameRefreshTime = Date.now();
  }
  if (notification !== currentNotification) {
    currentNotification = notification;
    console.log(notification);
  }
}

user.on("steamGuard", (_domain, callback) => {
  if (STEAM_GUARD_CODE) return callback(STEAM_GUARD_CODE);
  console.error("Steam Guard code required. A fresh code is needed; no interactive input is available on Render.");
});

user.on("refreshToken", (newToken) => {
  token = newToken;
  // Never print tokens. Render's ephemeral filesystem will not preserve this value.
  console.log("Steam issued a refresh token. Store it securely in Render as REFRESH_TOKEN for future restarts.");
});

user.on("playingState", (blocked) => {
  playingOnOtherSession = blocked;
  refreshGames();
});

user.on("loggedOn", () => {
  authenticated = true;
  console.log(`Successfully logged in to Steam with ID ${user.steamID}`);
  if (Number.isInteger(persona)) user.setPersona(persona);
  refreshGames();
});

user.on("disconnected", () => {
  authenticated = false;
  currentNotification = undefined;
});

user.on("error", (error) => {
  authenticated = false;
  if (error.eresult === Steam.EResult.RateLimitExceeded) {
    retryAfter = Date.now() + 31 * 60_000;
    console.error("Steam rate limited login; waiting at least 31 minutes.");
  } else if (error.eresult === Steam.EResult.LoggedInElsewhere) {
    console.error("Another Steam session disconnected this bot; will retry.");
  } else {
    console.error(`Steam login error: ${error.message}`);
    // A revoked refresh token requires a new credential; avoid repeated invalid logins.
    if (token) {
      console.error("If the refresh token was revoked, replace REFRESH_TOKEN with a new valid token.");
      retryAfter = Date.now() + 31 * 60_000;
    }
  }
});

logOn();
setInterval(logOn, 10 * 60_000);
setInterval(refreshGames, 5 * 60_000);
