#!/usr/bin/env node
"use strict";

const http = require("http");
const Steam = require("steam-user");

console.log(`Documentation: https://github.com/tacheometry/steam-hour-farmer`);

require("dotenv").config();
let { ACCOUNT_NAME, PASSWORD, PERSONA, GAMES, STEAM_GUARD_CODE } = process.env;
{
	PERSONA = parseInt(PERSONA);
	const shouldExist = (name) => {
		if (!process.env[name]) {
			console.error(
				`Environment variable "${name}" should be provided, but it is undefined.`
			);
			process.exit(1);
		}
	};

	shouldExist("ACCOUNT_NAME");
	shouldExist("PASSWORD");
	shouldExist("GAMES");
}

const SHOULD_PLAY = GAMES.split(",").map((game) => {
	const asNumber = parseInt(game);
	// NaN
	if (asNumber !== asNumber) return game;
	return asNumber;
});
if (SHOULD_PLAY.length === 0)
	console.warn("Could not find any games to play. Maybe this is a mistake?");

// Render requires an HTTP listener. 503 means the Steam session is not connected.
let authenticated = false;
const port = Number(process.env.PORT || 10000);
http.createServer((req, res) => {
  if (req.url !== "/health") { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(authenticated ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ steamConnected: authenticated }));
}).listen(port, "0.0.0.0", () => console.log(`Health endpoint listening on ${port}`));

const user = new Steam({
	machineIdType: Steam.EMachineIDType.PersistentRandom,
	dataDirectory: "SteamData",
	renewRefreshTokens: true,
});

let playingOnOtherSession = false;
let currentNotification;
let MIN_REQUEST_TIME = 60 * 1000;
let LOG_ON_INTERVAL = 10 * 60 * 1000;
let REFRESH_GAMES_INTERVAL = 5 * 60 * 1000;
let lastGameRefreshTime = new Date(0);
let lastLogOnTime = new Date(0);
let onlyLogInAfter = new Date(0);

const logOn = () => {
	if (authenticated) return;
	if (Date.now() - lastLogOnTime <= MIN_REQUEST_TIME) return;
	if (Date.now() < onlyLogInAfter) return;
	console.log("Logging in...");
	user.logOn({
		accountName: ACCOUNT_NAME,
		password: PASSWORD,
		machineName: "steam-hour-farmer",
		clientOS: Steam.EOSType.Windows10,
		twoFactorCode: STEAM_GUARD_CODE || undefined,
		autoRelogin: true,
	});
	lastLogOnTime = Date.now();
};

const panic = (message = "Exiting...") => {
	console.error(message);
	process.exit(1);
};

const refreshGames = () => {
	if (!authenticated) return;
	let notification;
	if (playingOnOtherSession) {
		notification = "Farming is paused.";
	} else {
		if (Date.now() - lastGameRefreshTime <= MIN_REQUEST_TIME) return;
		user.gamesPlayed(SHOULD_PLAY);
		notification = "Farming...";
		lastGameRefreshTime = Date.now();
	}
	if (currentNotification !== notification) {
		currentNotification = notification;
		console.log(notification);
	}
};

user.on("steamGuard", (domain, callback) => {
  // No interactive stdin is available on Render Free.
  // A fresh mobile-app code can be supplied as a temporary environment variable.
  if (STEAM_GUARD_CODE) return callback(STEAM_GUARD_CODE);
  console.error("Steam Guard code required. Set a fresh STEAM_GUARD_CODE in Render Environment and redeploy promptly.");
  // Deliberately do not print or persist authentication secrets.
});

user.on("playingState", (blocked, app) => {
	playingOnOtherSession = blocked;
	refreshGames();
});

user.on("loggedOn", () => {
	authenticated = true;
	console.log(`Successfully logged in to Steam with ID ${user.steamID}`);
	if (PERSONA !== undefined) user.setPersona(PERSONA);
	refreshGames();
});

user.on("error", (e) => {
	switch (e.eresult) {
		case Steam.EResult.LoggedInElsewhere: {
			authenticated = false;
			console.log(
				"Got kicked by other Steam session. Will log in shortly..."
			);
			logOn();
			return;
		}
		case Steam.EResult.RateLimitExceeded: {
			authenticated = false;
			onlyLogInAfter = Date.now() + 31 * 60 * 1000;
			console.log(
				"Got rate limited by Steam. Will try logging in again in 30 minutes."
			);
			return;
		}
		default: {
			panic(`Got an error from Steam: "${e.message}".`);
		}
	}
});

logOn();
setInterval(logOn, LOG_ON_INTERVAL);
setInterval(refreshGames, REFRESH_GAMES_INTERVAL);
