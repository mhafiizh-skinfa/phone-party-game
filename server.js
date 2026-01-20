/* ============================================
   PHONE PARTY GAME - SERVER
   Production Ready Version
============================================ */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
});

// Serve static files
app.use(express.static("public"));

// Game State
const gameState = {
	players: new Map(),
	currentGame: null,
	gamePhase: "lobby",
	settings: {
		maxPlayers: 8,
		gameTime: 60,
	},
};

// Player colors
const playerColors = [
	"#FF6B6B",
	"#4ECDC4",
	"#45B7D1",
	"#96CEB4",
	"#FFEAA7",
	"#DDA0DD",
	"#98D8C8",
	"#F7DC6F",
];

// Get server URL (works for both local and production)
function getServerURL(req) {
	// Check if behind proxy (production)
	const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
	const host = req.headers["x-forwarded-host"] || req.headers.host;
	return `${protocol}://${host}`;
}

// Get local IP for development
function getLocalIP() {
	const interfaces = os.networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name]) {
			if (iface.family === "IPv4" && !iface.internal) {
				return iface.address;
			}
		}
	}
	return "localhost";
}

const PORT = process.env.PORT || 3000;
const LOCAL_IP = getLocalIP();
const IS_PRODUCTION =
	process.env.NODE_ENV === "production" ||
	process.env.RAILWAY_ENVIRONMENT ||
	process.env.RENDER;

// Generate QR Code - Dynamic URL
app.get("/qrcode", async (req, res) => {
	try {
		let url;

		if (IS_PRODUCTION) {
			// Production:  use the request host
			const baseUrl = getServerURL(req);
			url = `${baseUrl}/controller.html`;
		} else {
			// Development: use local IP
			url = `http://${LOCAL_IP}:${PORT}/controller.html`;
		}

		console.log("📱 QR Code URL:", url);

		const qrDataUrl = await QRCode.toDataURL(url, {
			width: 300,
			margin: 2,
			color: {
				dark: "#000000",
				light: "#ffffff",
			},
		});
		res.json({ qr: qrDataUrl, url: url });
	} catch (err) {
		console.error("QR Code error:", err);
		res.status(500).json({ error: err.message });
	}
});

// Health check endpoint (untuk Railway/Render)
app.get("/health", (req, res) => {
	res.json({ status: "ok", players: gameState.players.size });
});

// API endpoint for game state
app.get("/api/state", (req, res) => {
	res.json({
		players: Array.from(gameState.players.values()),
		currentGame: gameState.currentGame,
		gamePhase: gameState.gamePhase,
	});
});

// Socket.io connection handling
io.on("connection", (socket) => {
	console.log(`🔌 New connection: ${socket.id}`);

	// Player joins
	socket.on("player:join", (data) => {
		console.log("📥 Player join request:", data);

		const playerCount = gameState.players.size;

		if (playerCount >= gameState.settings.maxPlayers) {
			console.log("❌ Game is full! ");
			socket.emit("error", { message: "Game is full!" });
			return;
		}

		const player = {
			id: socket.id,
			name: data.name || `Player ${playerCount + 1}`,
			color: playerColors[playerCount % playerColors.length],
			score: 0,
			isReady: false,
			position: { x: 0, y: 0 },
			velocity: { x: 0, y: 0 },
			input: { x: 0, y: 0, action: false },
		};

		gameState.players.set(socket.id, player);
		socket.join("game");

		console.log("✅ Player created:", player.name);

		// Send player data back to client
		socket.emit("player:joined", player);

		// Broadcast to display
		io.to("display").emit(
			"players:update",
			Array.from(gameState.players.values()),
		);

		console.log(
			`🎮 Player joined: ${player.name} (Total: ${gameState.players.size})`,
		);
	});

	// Display joins
	socket.on("display:join", () => {
		socket.join("display");
		socket.emit("players:update", Array.from(gameState.players.values()));
		socket.emit("game:state", {
			phase: gameState.gamePhase,
			currentGame: gameState.currentGame,
		});
		console.log("🖥️ Display connected");
	});

	// Player input
	socket.on("player:input", (input) => {
		const player = gameState.players.get(socket.id);
		if (player) {
			player.input = input;
			io.to("display").emit("player:input", {
				playerId: socket.id,
				input: input,
			});
		}
	});

	// Player tilt
	socket.on("player:tilt", (tilt) => {
		const player = gameState.players.get(socket.id);
		if (player) {
			player.input.x = tilt.x;
			player.input.y = tilt.y;
			io.to("display").emit("player:tilt", {
				playerId: socket.id,
				tilt: tilt,
			});
		}
	});

	// Player action
	socket.on("player:action", (action) => {
		const player = gameState.players.get(socket.id);
		if (player) {
			io.to("display").emit("player:action", {
				playerId: socket.id,
				action: action,
			});
		}
	});

	// Player ready
	socket.on("player:ready", () => {
		const player = gameState.players.get(socket.id);
		if (player) {
			player.isReady = !player.isReady;
			io.to("display").emit(
				"players:update",
				Array.from(gameState.players.values()),
			);

			const allReady = Array.from(gameState.players.values()).every(
				(p) => p.isReady,
			);
			if (allReady && gameState.players.size >= 1) {
				io.to("display").emit("game:allReady");
			}
		}
	});

	// Start game
	socket.on("game:start", (gameType) => {
		console.log(`🎮 Starting game: ${gameType}`);

		gameState.currentGame = gameType;
		gameState.gamePhase = "playing";

		gameState.players.forEach((player) => {
			player.score = 0;
			player.position = { x: Math.random() * 800, y: Math.random() * 600 };
			player.velocity = { x: 0, y: 0 };
		});

		io.emit("game:started", {
			game: gameType,
			players: Array.from(gameState.players.values()),
		});
	});

	// Game ended
	socket.on("game:end", (results) => {
		gameState.gamePhase = "results";
		io.emit("game:ended", results);
	});

	// Return to lobby
	socket.on("game:lobby", () => {
		gameState.gamePhase = "lobby";
		gameState.currentGame = null;
		gameState.players.forEach((player) => {
			player.isReady = false;
			player.score = 0;
		});
		io.emit("game:toLobby");
	});

	// Update player score
	socket.on("player:score", (data) => {
		const player = gameState.players.get(data.playerId);
		if (player) {
			player.score = data.score;
			io.to(data.playerId).emit("score:update", data.score);
		}
	});

	// Vibrate player's phone
	socket.on("player:vibrate", (data) => {
		io.to(data.playerId).emit("vibrate", data.pattern || [100]);
	});

	// Disconnect
	socket.on("disconnect", () => {
		const player = gameState.players.get(socket.id);
		if (player) {
			console.log(`👋 Player left: ${player.name}`);
			gameState.players.delete(socket.id);
			io.to("display").emit(
				"players:update",
				Array.from(gameState.players.values()),
			);
		}
	});
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
	console.log("");
	console.log("🎮 ================================");
	console.log("   PHONE PARTY GAME SERVER");
	console.log("================================");
	console.log("");
	if (IS_PRODUCTION) {
		console.log(`🌐 Running in PRODUCTION mode`);
		console.log(`📺 Server running on port ${PORT}`);
	} else {
		console.log(`📺 Display:      http://localhost:${PORT}`);
		console.log(`📱 Controller:  http://${LOCAL_IP}:${PORT}/controller.html`);
	}
	console.log("");
	console.log("Scan QR code on the display to join! ");
	console.log("================================");
	console.log("");
});
