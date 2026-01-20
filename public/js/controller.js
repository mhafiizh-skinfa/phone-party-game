/* ============================================
   PHONE PARTY GAME - CONTROLLER (Phone)
============================================ */

class PhoneController {
	constructor() {
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
	}

	/* ----------------------------------------
       SOCKET SETUP
    ---------------------------------------- */
	setupSocket() {
		this.socket.on("connect", () => {
			console.log("Connected to server");
		});

		this.socket.on("player: joined", (player) => {
			this.player = player;
			this.showScreen("waiting-screen");
			this.updatePlayerDisplay();
		});

		this.socket.on("error", (data) => {
			alert(data.message);
		});

		this.socket.on("game:started", (data) => {
			this.currentGame = data.game;
			this.showControllerForGame(data.game);
		});

		this.socket.on("score:update", (score) => {
			this.updateScore(score);
		});

		this.socket.on("vibrate", (pattern) => {
			this.vibrate(pattern);
		});

		this.socket.on("game:ended", (results) => {
			this.showResults(results);
		});

		this.socket.on("game:toLobby", () => {
			this.isReady = false;
			this.currentGame = null;
			this.showScreen("waiting-screen");
			this.updateReadyButton();
		});

		this.socket.on("quiz:question", (data) => {
			// Quiz question received - buttons are already set up
		});

		this.socket.on("quiz:feedback", (data) => {
			this.showQuizFeedback(data);
		});
	}

	/* ----------------------------------------
       UI SETUP
    ---------------------------------------- */
	setupUI() {
		// Join button
		document.getElementById("join-btn").addEventListener("click", () => {
			this.joinGame();
		});

		// Enter key on name input
		document.getElementById("player-name").addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				this.joinGame();
			}
		});

		// Ready button
		document.getElementById("ready-btn").addEventListener("click", () => {
			this.toggleReady();
		});

		// Tilt action button (boost)
		document
			.getElementById("tilt-action-btn")
			?.addEventListener("touchstart", (e) => {
				e.preventDefault();
				this.sendAction({ type: "boost" });
				this.vibrate([50]);
			});

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
		});

		// Action buttons (A, B)
		document.getElementById("action-a")?.addEventListener("touchstart", (e) => {
			e.preventDefault();
			this.sendAction({ type: "attack" });
			this.vibrate([30]);
		});

		document.getElementById("action-b")?.addEventListener("touchstart", (e) => {
			e.preventDefault();
			this.sendAction({ type: "special" });
			this.vibrate([30]);
		});

		// Quiz buttons
		document.querySelectorAll(".quiz-btn").forEach((btn) => {
			btn.addEventListener("touchstart", (e) => {
				e.preventDefault();
				const answer = btn.dataset.answer;
				this.sendAction({ type: "answer", answer: answer });
				this.vibrate([30]);
			});
		});
	}

	/* ----------------------------------------
       TILT/GYROSCOPE SETUP
    ---------------------------------------- */
	setupTilt() {
		// Request permission for iOS 13+
		if (
			typeof DeviceOrientationEvent !== "undefined" &&
			typeof DeviceOrientationEvent.requestPermission === "function"
		) {
			// Add a button to request permission
			document.body.addEventListener(
				"click",
				() => {
					if (!this.isTiltCalibrated) {
						DeviceOrientationEvent.requestPermission()
							.then((response) => {
								if (response === "granted") {
									this.enableTilt();
								}
							})
							.catch(console.error);
					}
				},
				{ once: true },
			);
		} else {
			this.enableTilt();
		}
	}

	enableTilt() {
		window.addEventListener("deviceorientation", (e) => {
			if (!this.currentGame) return;

			// Get tilt values
			let x = e.gamma || 0; // Left/Right tilt (-90 to 90)
			let y = e.beta || 0; // Front/Back tilt (-180 to 180)

			// Calibrate on first reading
			if (!this.isTiltCalibrated) {
				this.tiltCalibration = { x, y };
				this.isTiltCalibrated = true;
			}

			// Apply calibration
			x -= this.tiltCalibration.x;
			y -= this.tiltCalibration.y;

			// Normalize to -1 to 1
			this.tilt.x = Math.max(-1, Math.min(1, x / 30));
			this.tilt.y = Math.max(-1, Math.min(1, y / 30));

			// Update visual indicator
			this.updateTiltIndicator();

			// Send to server
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
		const name = nameInput.value.trim() || "Player";

		this.socket.emit("player:join", { name });
	}

	toggleReady() {
		this.isReady = !this.isReady;
		this.socket.emit("player:ready");
		this.updateReadyButton();
	}

	updateReadyButton() {
		const btn = document.getElementById("ready-btn");
		const status = document.getElementById("ready-status");

		if (this.isReady) {
			btn.classList.add("ready");
			btn.textContent = "✅ SIAP!";
			status.textContent = "Menunggu pemain lain... ";
		} else {
			btn.classList.remove("ready");
			btn.textContent = "✋ SIAP";
			status.textContent = "";
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
		this.socket.emit("player:action", action);
	}

	/* ----------------------------------------
       UI UPDATES
    ---------------------------------------- */
	showScreen(screenId) {
		document
			.querySelectorAll(".screen")
			.forEach((s) => s.classList.remove("active"));
		document.getElementById(screenId).classList.add("active");
	}

	updatePlayerDisplay() {
		if (!this.player) return;

		// Update avatar
		const avatar = document.getElementById("player-avatar");
		avatar.textContent = this.player.name.charAt(0).toUpperCase();
		avatar.style.borderColor = this.player.color;
		avatar.style.background = this.player.color + "40";

		// Update name
		document.getElementById("player-display-name").textContent =
			this.player.name;
	}

	showControllerForGame(gameType) {
		// Hide all controller screens first
		document
			.querySelectorAll(".controller-screen")
			.forEach((s) => s.classList.remove("active"));

		switch (gameType) {
			case "racing":
				this.showScreen("controller-tilt");
				// Reset calibration for new game
				this.isTiltCalibrated = false;
				break;
			case "battle":
				this.showScreen("controller-buttons");
				break;
			case "quiz":
				this.showScreen("controller-quiz");
				break;
			default:
				this.showScreen("controller-tilt");
		}
	}

	updateScore(score) {
		// Update score on all controller screens
		document.querySelectorAll(".score").forEach((el) => {
			el.textContent = score;
		});
	}

	showQuizFeedback(data) {
		const buttons = document.querySelectorAll(".quiz-btn");
		buttons.forEach((btn) => {
			btn.classList.remove("correct", "wrong");
			if (btn.dataset.answer === data.correctAnswer) {
				btn.classList.add("correct");
			} else if (btn.dataset.answer === data.yourAnswer && !data.isCorrect) {
				btn.classList.add("wrong");
			}
		});

		// Reset after animation
		setTimeout(() => {
			buttons.forEach((btn) => btn.classList.remove("correct", "wrong"));
		}, 1000);
	}

	showResults(results) {
		this.showScreen("result-screen");

		// Find this player's result
		const myResult = results.find((r) => r.id === this.player?.id);
		const position = results.findIndex((r) => r.id === this.player?.id) + 1;

		// Update display
		const positionEmojis = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];
		document.getElementById("result-position").textContent =
			positionEmojis[position - 1] || position;

		const resultTexts = ["JUARA 1! ", "JUARA 2!", "JUARA 3!", "Good Game!"];
		document.getElementById("result-text").textContent =
			resultTexts[position - 1] || "Good Game!";

		document.getElementById("result-score").textContent =
			`Score: ${myResult?.score || 0}`;

		// Vibrate based on position
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
	window.controller = new PhoneController();
});
