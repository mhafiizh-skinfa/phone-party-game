/* ============================================
   PHONE PARTY GAME - CONTROLLER (Phone)
   FIXED VERSION dengan debugging
============================================ */

class PhoneController {
	constructor() {
		console.log("🎮 Initializing Phone Controller.. .");

		this.socket = io();
		this.player = null;
		this.isReady = false;
		this.currentGame = null;

		// Tilt data
		this.tilt = { x: 0, y: 0 };
		this.tiltCalibration = { x: 0, y: 0 };
		this.isTiltCalibrated = false;

		// Input state
		this.input = { x: 0, y: 0, action: false };

		this.init();
	}

	init() {
		this.setupSocket();
		this.setupUI();
		this.setupTilt();
		console.log("✅ Controller initialized! ");
	}

	/* ----------------------------------------
       SOCKET SETUP
    ---------------------------------------- */
	setupSocket() {
		this.socket.on("connect", () => {
			console.log("✅ Connected to server with ID:", this.socket.id);
		});

		this.socket.on("disconnect", () => {
			console.log("❌ Disconnected from server");
		});

		this.socket.on("player:joined", (player) => {
			console.log("✅ Player joined:", player);
			this.player = player;
			this.showScreen("waiting-screen");
			this.updatePlayerDisplay();
		});

		this.socket.on("error", (data) => {
			console.error("❌ Error:", data);
			alert(data.message);
		});

		this.socket.on("game:started", (data) => {
			console.log("🎮 Game started:", data.game);
			this.currentGame = data.game;
			this.showControllerForGame(data.game);
		});

		this.socket.on("score:update", (score) => {
			console.log("📊 Score update:", score);
			this.updateScore(score);
		});

		this.socket.on("vibrate", (pattern) => {
			this.vibrate(pattern);
		});

		this.socket.on("game:ended", (results) => {
			console.log("🏁 Game ended:", results);
			this.showResults(results);
		});

		this.socket.on("game:toLobby", () => {
			console.log("🏠 Returning to lobby");
			this.isReady = false;
			this.currentGame = null;
			this.showScreen("waiting-screen");
			this.updateReadyButton();
		});
	}

	/* ----------------------------------------
       UI SETUP
    ---------------------------------------- */
	setupUI() {
		// Join button
		const joinBtn = document.getElementById("join-btn");
		if (joinBtn) {
			joinBtn.addEventListener("click", (e) => {
				e.preventDefault();
				console.log("🔘 Join button clicked");
				this.joinGame();
			});
		} else {
			console.error("❌ Join button not found! ");
		}

		// Enter key on name input
		const nameInput = document.getElementById("player-name");
		if (nameInput) {
			nameInput.addEventListener("keypress", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					console.log("⌨️ Enter pressed");
					this.joinGame();
				}
			});
		}

		// Ready button
		const readyBtn = document.getElementById("ready-btn");
		if (readyBtn) {
			readyBtn.addEventListener("click", (e) => {
				e.preventDefault();
				console.log("🔘 Ready button clicked");
				this.toggleReady();
			});
		}

		// Tilt action button (boost)
		const tiltActionBtn = document.getElementById("tilt-action-btn");
		if (tiltActionBtn) {
			tiltActionBtn.addEventListener("touchstart", (e) => {
				e.preventDefault();
				this.sendAction({ type: "boost" });
				this.vibrate([50]);
			});
			tiltActionBtn.addEventListener("click", (e) => {
				e.preventDefault();
				this.sendAction({ type: "boost" });
			});
		}

		// D-pad buttons
		document.querySelectorAll(".dpad-btn").forEach((btn) => {
			btn.addEventListener("touchstart", (e) => {
				e.preventDefault();
				const dir = btn.dataset.dir;
				this.handleDpadPress(dir, true);
			});
			btn.addEventListener("touchend", (e) => {
				e.preventDefault();
				const dir = btn.dataset.dir;
				this.handleDpadPress(dir, false);
			});
			// Mouse support for testing
			btn.addEventListener("mousedown", (e) => {
				const dir = btn.dataset.dir;
				this.handleDpadPress(dir, true);
			});
			btn.addEventListener("mouseup", (e) => {
				const dir = btn.dataset.dir;
				this.handleDpadPress(dir, false);
			});
		});

		// Action buttons (A, B)
		const actionA = document.getElementById("action-a");
		if (actionA) {
			actionA.addEventListener("touchstart", (e) => {
				e.preventDefault();
				this.sendAction({ type: "attack" });
				this.vibrate([30]);
			});
			actionA.addEventListener("click", () => {
				this.sendAction({ type: "attack" });
			});
		}

		const actionB = document.getElementById("action-b");
		if (actionB) {
			actionB.addEventListener("touchstart", (e) => {
				e.preventDefault();
				this.sendAction({ type: "special" });
				this.vibrate([30]);
			});
			actionB.addEventListener("click", () => {
				this.sendAction({ type: "special" });
			});
		}

		// Quiz buttons
		document.querySelectorAll(".quiz-btn").forEach((btn) => {
			btn.addEventListener("touchstart", (e) => {
				e.preventDefault();
				const answer = btn.dataset.answer;
				this.sendAction({ type: "answer", answer: answer });
				this.vibrate([30]);
			});
			btn.addEventListener("click", () => {
				const answer = btn.dataset.answer;
				this.sendAction({ type: "answer", answer: answer });
			});
		});
	}

	/* ----------------------------------------
       TILT/GYROSCOPE SETUP
    ---------------------------------------- */
	setupTilt() {
		if (
			typeof DeviceOrientationEvent !== "undefined" &&
			typeof DeviceOrientationEvent.requestPermission === "function"
		) {
			// iOS 13+ requires permission
			document.body.addEventListener(
				"click",
				() => {
					if (!this.isTiltCalibrated && this.currentGame === "racing") {
						DeviceOrientationEvent.requestPermission()
							.then((response) => {
								if (response === "granted") {
									this.enableTilt();
								}
							})
							.catch(console.error);
					}
				},
				{ once: false },
			);
		} else {
			this.enableTilt();
		}
	}

	enableTilt() {
		window.addEventListener("deviceorientation", (e) => {
			if (!this.currentGame || this.currentGame !== "racing") return;

			let x = e.gamma || 0;
			let y = e.beta || 0;

			if (!this.isTiltCalibrated) {
				this.tiltCalibration = { x, y };
				this.isTiltCalibrated = true;
			}

			x -= this.tiltCalibration.x;
			y -= this.tiltCalibration.y;

			this.tilt.x = Math.max(-1, Math.min(1, x / 30));
			this.tilt.y = Math.max(-1, Math.min(1, y / 30));

			this.updateTiltIndicator();
			this.socket.emit("player:tilt", this.tilt);
		});
	}

	updateTiltIndicator() {
		const dot = document.querySelector(".tilt-dot");
		if (dot) {
			const offsetX = this.tilt.x * 80;
			const offsetY = this.tilt.y * 80;
			dot.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
		}
	}

	/* ----------------------------------------
       GAME ACTIONS
    ---------------------------------------- */
	joinGame() {
		const nameInput = document.getElementById("player-name");
		const name = nameInput ? nameInput.value.trim() : "Player";

		console.log("📤 Sending player: join with name:", name || "Player");
		this.socket.emit("player:join", { name: name || "Player" });
	}

	toggleReady() {
		this.isReady = !this.isReady;
		console.log("📤 Sending player:ready, isReady:", this.isReady);
		this.socket.emit("player:ready");
		this.updateReadyButton();
	}

	updateReadyButton() {
		const btn = document.getElementById("ready-btn");
		const status = document.getElementById("ready-status");

		if (!btn) return;

		if (this.isReady) {
			btn.classList.add("ready");
			btn.textContent = "✅ SIAP!";
			if (status) status.textContent = "Menunggu pemain lain...";
		} else {
			btn.classList.remove("ready");
			btn.textContent = "✋ SIAP";
			if (status) status.textContent = "";
		}
	}

	handleDpadPress(direction, isPressed) {
		switch (direction) {
			case "up":
				this.input.y = isPressed ? -1 : 0;
				break;
			case "down":
				this.input.y = isPressed ? 1 : 0;
				break;
			case "left":
				this.input.x = isPressed ? -1 : 0;
				break;
			case "right":
				this.input.x = isPressed ? 1 : 0;
				break;
		}
		this.socket.emit("player:input", this.input);
	}

	sendAction(action) {
		console.log("📤 Sending action:", action);
		this.socket.emit("player:action", action);
	}

	/* ----------------------------------------
       UI UPDATES
    ---------------------------------------- */
	showScreen(screenId) {
		console.log("📺 Showing screen:", screenId);

		const screens = document.querySelectorAll(".screen");
		screens.forEach((s) => {
			s.classList.remove("active");
		});

		const targetScreen = document.getElementById(screenId);
		if (targetScreen) {
			targetScreen.classList.add("active");
			console.log("✅ Screen shown:", screenId);
		} else {
			console.error("❌ Screen not found:", screenId);
		}
	}

	updatePlayerDisplay() {
		if (!this.player) {
			console.log("⚠️ No player data to display");
			return;
		}

		console.log("👤 Updating player display:", this.player);

		const avatar = document.getElementById("player-avatar");
		if (avatar) {
			avatar.textContent = this.player.name.charAt(0).toUpperCase();
			avatar.style.borderColor = this.player.color;
			avatar.style.background = this.player.color + "40";
		}

		const displayName = document.getElementById("player-display-name");
		if (displayName) {
			displayName.textContent = this.player.name;
		}
	}

	showControllerForGame(gameType) {
		console.log("🎮 Showing controller for game:", gameType);

		document.querySelectorAll(".controller-screen").forEach((s) => {
			s.classList.remove("active");
		});

		let screenId;
		switch (gameType) {
			case "racing":
				screenId = "controller-tilt";
				this.isTiltCalibrated = false;
				break;
			case "battle":
				screenId = "controller-buttons";
				break;
			case "quiz":
				screenId = "controller-quiz";
				break;
			default:
				screenId = "controller-tilt";
		}

		this.showScreen(screenId);
	}

	updateScore(score) {
		document.querySelectorAll(".score").forEach((el) => {
			el.textContent = score;
		});
	}

	showResults(results) {
		this.showScreen("result-screen");

		if (!this.player) return;

		const myResult = results.find((r) => r.id === this.player.id);
		const position = results.findIndex((r) => r.id === this.player.id) + 1;

		const positionEmojis = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];

		const positionEl = document.getElementById("result-position");
		if (positionEl) {
			positionEl.textContent = positionEmojis[position - 1] || position;
		}

		const resultTexts = ["JUARA 1! ", "JUARA 2!", "JUARA 3!", "Good Game!"];
		const textEl = document.getElementById("result-text");
		if (textEl) {
			textEl.textContent = resultTexts[position - 1] || "Good Game!";
		}

		const scoreEl = document.getElementById("result-score");
		if (scoreEl) {
			scoreEl.textContent = `Score: ${myResult?.score || 0}`;
		}

		if (position === 1) {
			this.vibrate([100, 50, 100, 50, 100]);
		} else if (position <= 3) {
			this.vibrate([100, 50, 100]);
		}
	}

	vibrate(pattern) {
		if (navigator.vibrate) {
			navigator.vibrate(pattern);
		}
	}
}

// Initialize controller when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	console.log("📱 DOM Loaded - Starting Phone Controller...");
	window.controller = new PhoneController();
});
