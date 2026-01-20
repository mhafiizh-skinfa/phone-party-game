/* ============================================
   PHONE PARTY GAME - DISPLAY (Main Screen)
============================================ */

class PartyGameDisplay {
	constructor() {
		this.socket = io();
		this.players = [];
		this.currentGame = null;
		this.gamePhase = "lobby";
		this.selectedGame = null;

		// Canvas
		this.canvas = document.getElementById("game-canvas");
		this.ctx = this.canvas.getContext("2d");

		// Game state
		this.gameTimer = 60;
		this.timerInterval = null;
		this.animationFrame = null;

		// Game objects
		this.gameObjects = {};

		// Game-specific data
		this.raceTrack = null;
		this.battleEffects = [];
		this.quizData = null;

		this.init();
	}

	init() {
		this.setupSocket();
		this.setupUI();
		this.loadQRCode();
		this.resizeCanvas();

		window.addEventListener("resize", () => this.resizeCanvas());

		console.log("🎮 Party Game Display initialized! ");
	}

	/* ----------------------------------------
       SOCKET SETUP
    ---------------------------------------- */
	setupSocket() {
		this.socket.emit("display:join");

		this.socket.on("players:update", (players) => {
			this.players = players;
			this.updatePlayersUI();
			this.updateGameButtons();
		});

		this.socket.on("game:state", (state) => {
			this.gamePhase = state.phase;
			this.currentGame = state.currentGame;
		});

		this.socket.on("game:allReady", () => {
			document.getElementById("start-section").classList.remove("hidden");
		});

		this.socket.on("player:tilt", (data) => {
			this.handlePlayerTilt(data.playerId, data.tilt);
		});

		this.socket.on("player:input", (data) => {
			this.handlePlayerInput(data.playerId, data.input);
		});

		this.socket.on("player:action", (data) => {
			this.handlePlayerAction(data.playerId, data.action);
		});

		this.socket.on("game:started", (data) => {
			this.startGame(data.game, data.players);
		});

		this.socket.on("game:toLobby", () => {
			this.returnToLobby();
		});
	}

	/* ----------------------------------------
       UI SETUP
    ---------------------------------------- */
	setupUI() {
		// Game selection buttons
		document.querySelectorAll(".game-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				if (btn.disabled) return;

				document
					.querySelectorAll(".game-btn")
					.forEach((b) => b.classList.remove("selected"));
				btn.classList.add("selected");
				this.selectedGame = btn.dataset.game;
			});
		});

		// Start game button
		document.getElementById("start-game-btn").addEventListener("click", () => {
			if (this.selectedGame && this.players.length > 0) {
				this.socket.emit("game:start", this.selectedGame);
			} else if (!this.selectedGame) {
				alert("Pilih game terlebih dahulu! ");
			}
		});

		// Back to lobby button
		document.getElementById("back-to-lobby").addEventListener("click", () => {
			this.socket.emit("game:lobby");
		});
	}

	async loadQRCode() {
		try {
			const response = await fetch("/qrcode");
			const data = await response.json();

			const container = document.getElementById("qr-container");
			container.innerHTML = `<img src="${data.qr}" alt="QR Code">`;

			document.getElementById("join-url").textContent = data.url;
		} catch (error) {
			console.error("Error loading QR code:", error);
			document.getElementById("qr-container").innerHTML =
				'<div class="qr-loading">Error loading QR</div>';
		}
	}

	resizeCanvas() {
		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
	}

	/* ----------------------------------------
       PLAYERS UI
    ---------------------------------------- */
	updatePlayersUI() {
		const list = document.getElementById("players-list");
		const count = document.getElementById("player-count");

		count.textContent = `(${this.players.length}/8)`;

		if (this.players.length === 0) {
			list.innerHTML = '<div class="no-players">Menunggu pemain... </div>';
			document.getElementById("start-section").classList.add("hidden");
			return;
		}

		list.innerHTML = this.players
			.map(
				(player) => `
            <div class="player-card ${player.isReady ? "ready" : ""}">
                <div class="player-avatar" style="background:  ${player.color}">
                    ${player.name.charAt(0).toUpperCase()}
                </div>
                <div class="player-name">${player.name}</div>
                <div class="ready-badge">✓</div>
            </div>
        `,
			)
			.join("");

		// Check if all ready
		const allReady = this.players.every((p) => p.isReady);
		if (allReady && this.players.length >= 1) {
			document.getElementById("start-section").classList.remove("hidden");
		} else {
			document.getElementById("start-section").classList.add("hidden");
		}
	}

	updateGameButtons() {
		const hasPlayers = this.players.length > 0;
		document.querySelectorAll(".game-btn").forEach((btn) => {
			btn.disabled = !hasPlayers;
		});
	}

	showScreen(screenId) {
		document
			.querySelectorAll(".screen")
			.forEach((s) => s.classList.remove("active"));
		document.getElementById(screenId).classList.add("active");
	}

	/* ----------------------------------------
       GAME START
    ---------------------------------------- */
	startGame(gameType, players) {
		this.currentGame = gameType;
		this.players = players;
		this.gamePhase = "playing";
		this.gameTimer = 60;

		// Initialize game objects
		this.initGameObjects(gameType);

		// Show game screen
		this.showScreen("game-screen");
		document.getElementById("game-title").textContent =
			this.getGameTitle(gameType);

		// Start timer
		this.startTimer();

		// Start game loop
		this.startGameLoop();

		// Update score display
		this.updateScoreDisplay();
	}

	getGameTitle(gameType) {
		const titles = {
			racing: "🏎️ Tilt Racing",
			battle: "⚔️ Battle Arena",
			quiz: "🧠 Quick Quiz",
		};
		return titles[gameType] || gameType;
	}

	initGameObjects(gameType) {
		this.gameObjects = {};
		this.battleEffects = [];

		const positions = this.getStartPositions(this.players.length);

		this.players.forEach((player, index) => {
			this.gameObjects[player.id] = {
				id: player.id,
				x: positions[index].x,
				y: positions[index].y,
				vx: 0,
				vy: 0,
				width: 50,
				height: 50,
				color: player.color,
				name: player.name,
				score: 0,
				speed: 5,
				boost: false,
				health: 100,
				maxHealth: 100,
				lastAction: 0,
				// Racing specific
				currentCheckpoint: 0,
				laps: 0,
			};
		});

		// Initialize game-specific objects
		if (gameType === "racing") {
			this.initRacingGame();
		} else if (gameType === "battle") {
			this.initBattleGame();
		} else if (gameType === "quiz") {
			this.initQuizGame();
		}
	}

	getStartPositions(count) {
		const positions = [];
		const cx = this.canvas.width / 2;
		const cy = this.canvas.height / 2;
		const radius = Math.min(200, this.canvas.width / 4);

		for (let i = 0; i < count; i++) {
			const angle = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
			positions.push({
				x: cx + Math.cos(angle) * radius,
				y: cy + Math.sin(angle) * radius,
			});
		}
		return positions;
	}

	startTimer() {
		document.getElementById("game-timer").textContent = this.gameTimer;

		if (this.timerInterval) clearInterval(this.timerInterval);

		this.timerInterval = setInterval(() => {
			this.gameTimer--;
			document.getElementById("game-timer").textContent = this.gameTimer;

			if (this.gameTimer <= 10) {
				document.getElementById("game-timer").style.color = "#ff4444";
			}

			if (this.gameTimer <= 0) {
				this.endGame();
			}
		}, 1000);
	}

	startGameLoop() {
		const loop = () => {
			if (this.gamePhase !== "playing") return;

			this.updateGame();
			this.renderGame();

			this.animationFrame = requestAnimationFrame(loop);
		};
		loop();
	}

	/* ----------------------------------------
       PLAYER INPUT HANDLERS
    ---------------------------------------- */
	handlePlayerTilt(playerId, tilt) {
		const obj = this.gameObjects[playerId];
		if (!obj) return;

		const speed = obj.boost ? obj.speed * 2 : obj.speed;
		obj.vx = tilt.x * speed;
		obj.vy = tilt.y * speed;
	}

	handlePlayerInput(playerId, input) {
		const obj = this.gameObjects[playerId];
		if (!obj) return;

		obj.vx = input.x * obj.speed;
		obj.vy = input.y * obj.speed;
	}

	handlePlayerAction(playerId, action) {
		const obj = this.gameObjects[playerId];
		if (!obj) return;

		const now = Date.now();

		switch (this.currentGame) {
			case "racing":
				if (action.type === "boost") {
					obj.boost = true;
					setTimeout(() => {
						obj.boost = false;
					}, 500);
				}
				break;

			case "battle":
				if (action.type === "attack" && now - obj.lastAction > 300) {
					obj.lastAction = now;
					this.performAttack(playerId);
				}
				break;

			case "quiz":
				if (action.type === "answer") {
					this.handleQuizAnswer(playerId, action.answer);
				}
				break;
		}
	}

	/* ----------------------------------------
       GAME UPDATE
    ---------------------------------------- */
	updateGame() {
		switch (this.currentGame) {
			case "racing":
				this.updateRacing();
				break;
			case "battle":
				this.updateBattle();
				break;
			case "quiz":
				this.updateQuiz();
				break;
		}

		// Sync scores to players
		this.updateScoreDisplay();
	}

	/* ----------------------------------------
       RACING GAME
    ---------------------------------------- */
	initRacingGame() {
		const cx = this.canvas.width / 2;
		const cy = this.canvas.height / 2;
		const radius = Math.min(250, this.canvas.width / 3);

		this.raceTrack = {
			center: { x: cx, y: cy },
			radius: radius,
			checkpoints: [],
		};

		// Create checkpoints around the track
		for (let i = 0; i < 8; i++) {
			const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
			this.raceTrack.checkpoints.push({
				x: cx + Math.cos(angle) * radius,
				y: cy + Math.sin(angle) * radius,
				radius: 30,
				index: i,
			});
		}
	}

	updateRacing() {
		Object.values(this.gameObjects).forEach((obj) => {
			// Apply velocity
			obj.x += obj.vx;
			obj.y += obj.vy;

			// Friction
			obj.vx *= 0.95;
			obj.vy *= 0.95;

			// Bounds
			obj.x = Math.max(30, Math.min(this.canvas.width - 30, obj.x));
			obj.y = Math.max(30, Math.min(this.canvas.height - 30, obj.y));

			// Check checkpoints
			if (this.raceTrack && this.raceTrack.checkpoints.length > 0) {
				const targetCheckpoint =
					this.raceTrack.checkpoints[obj.currentCheckpoint];
				const dx = obj.x - targetCheckpoint.x;
				const dy = obj.y - targetCheckpoint.y;
				const dist = Math.sqrt(dx * dx + dy * dy);

				if (dist < targetCheckpoint.radius + obj.width / 2) {
					obj.currentCheckpoint++;
					obj.score += 10;

					if (obj.currentCheckpoint >= this.raceTrack.checkpoints.length) {
						obj.currentCheckpoint = 0;
						obj.laps++;
						obj.score += 100;

						// Notify player
						this.socket.emit("player:score", {
							playerId: obj.id,
							score: obj.score,
						});
					}
				}
			}
		});
	}

	/* ----------------------------------------
       BATTLE GAME
    ---------------------------------------- */
	initBattleGame() {
		this.battleEffects = [];

		Object.values(this.gameObjects).forEach((obj) => {
			obj.health = 100;
			obj.maxHealth = 100;
			obj.attackRadius = 80;
		});
	}

	updateBattle() {
		Object.values(this.gameObjects).forEach((obj) => {
			// Apply velocity
			obj.x += obj.vx;
			obj.y += obj.vy;

			// Friction
			obj.vx *= 0.9;
			obj.vy *= 0.9;

			// Bounds
			obj.x = Math.max(40, Math.min(this.canvas.width - 40, obj.x));
			obj.y = Math.max(40, Math.min(this.canvas.height - 40, obj.y));

			// Regenerate health slowly
			if (obj.health < obj.maxHealth) {
				obj.health += 0.05;
			}
		});

		// Update effects
		this.battleEffects = this.battleEffects.filter((e) => {
			e.life--;
			e.radius += 8;
			e.alpha = e.life / e.maxLife;
			return e.life > 0;
		});
	}

	performAttack(attackerId) {
		const attacker = this.gameObjects[attackerId];
		if (!attacker) return;

		// Add attack effect
		this.battleEffects.push({
			x: attacker.x,
			y: attacker.y,
			radius: 20,
			maxRadius: attacker.attackRadius,
			color: attacker.color,
			life: 10,
			maxLife: 10,
			alpha: 1,
		});

		// Check hits on other players
		Object.entries(this.gameObjects).forEach(([id, target]) => {
			if (id === attackerId) return;

			const dx = target.x - attacker.x;
			const dy = target.y - attacker.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (dist < attacker.attackRadius) {
				// Hit!
				const damage = 25;
				target.health -= damage;
				attacker.score += 25;

				// Knockback
				const angle = Math.atan2(dy, dx);
				target.vx += Math.cos(angle) * 20;
				target.vy += Math.sin(angle) * 20;

				// Vibrate hit player's phone
				this.socket.emit("player:vibrate", {
					playerId: id,
					pattern: [100, 50, 100],
				});

				// Respawn if dead
				if (target.health <= 0) {
					target.health = target.maxHealth;
					target.x = this.canvas.width / 2 + (Math.random() - 0.5) * 300;
					target.y = this.canvas.height / 2 + (Math.random() - 0.5) * 300;
					attacker.score += 100;
				}

				// Update scores
				this.socket.emit("player:score", {
					playerId: attackerId,
					score: attacker.score,
				});
			}
		});
	}

	/* ----------------------------------------
       QUIZ GAME
    ---------------------------------------- */
	initQuizGame() {
		this.quizData = {
			questions: [
				{
					q: "Hasil dari 7 × 8 = ? ",
					options: ["54", "56", "58", "62"],
					correct: 1,
				},
				{
					q: "Ibukota Indonesia?",
					options: ["Jakarta", "Bandung", "Surabaya", "Yogyakarta"],
					correct: 0,
				},
				{
					q: "Planet terbesar? ",
					options: ["Mars", "Venus", "Jupiter", "Saturnus"],
					correct: 2,
				},
				{
					q: "HTML adalah singkatan? ",
					options: [
						"Hyper Text Markup Language",
						"High Tech Modern Language",
						"Home Tool Markup Language",
						"Hyperlink Text Mode Language",
					],
					correct: 0,
				},
				{
					q: "1 Kilometer = ?  Meter",
					options: ["100", "500", "1000", "10000"],
					correct: 2,
				},
				{
					q: "Hewan tercepat di darat?",
					options: ["Singa", "Cheetah", "Harimau", "Kuda"],
					correct: 1,
				},
				{
					q: "Warna hasil campuran merah + biru?",
					options: ["Hijau", "Kuning", "Ungu", "Orange"],
					correct: 2,
				},
				{
					q: "Negara dengan penduduk terbanyak?",
					options: ["USA", "India", "China", "Indonesia"],
					correct: 2,
				},
			],
			currentIndex: 0,
			showingQuestion: false,
			questionTimer: 0,
			answeredPlayers: new Set(),
		};

		this.showNextQuestion();
	}

	showNextQuestion() {
		if (!this.quizData) return;

		this.quizData.currentIndex =
			(this.quizData.currentIndex + 1) % this.quizData.questions.length;
		this.quizData.answeredPlayers.clear();
		this.quizData.showingQuestion = true;
		this.quizData.questionTimer = 100; // frames to show question
	}

	updateQuiz() {
		if (!this.quizData) return;

		if (this.quizData.showingQuestion) {
			this.quizData.questionTimer--;

			// Auto advance after timer
			if (this.quizData.questionTimer <= 0) {
				this.quizData.showingQuestion = false;
				setTimeout(() => this.showNextQuestion(), 2000);
			}
		}
	}

	handleQuizAnswer(playerId, answer) {
		if (!this.quizData || this.quizData.answeredPlayers.has(playerId)) return;

		this.quizData.answeredPlayers.add(playerId);

		const question = this.quizData.questions[this.quizData.currentIndex];
		const answerIndex = ["A", "B", "C", "D"].indexOf(answer);
		const isCorrect = answerIndex === question.correct;

		const obj = this.gameObjects[playerId];
		if (obj) {
			if (isCorrect) {
				// Points based on speed (earlier = more points)
				const speedBonus = Math.max(
					0,
					50 - this.quizData.answeredPlayers.size * 10,
				);
				obj.score += 100 + speedBonus;
			}

			this.socket.emit("player:score", { playerId, score: obj.score });
		}

		// Check if all answered
		if (
			this.quizData.answeredPlayers.size >= Object.keys(this.gameObjects).length
		) {
			this.quizData.showingQuestion = false;
			setTimeout(() => this.showNextQuestion(), 2000);
		}
	}

	/* ----------------------------------------
       RENDER
    ---------------------------------------- */
	renderGame() {
		// Clear canvas
		this.ctx.fillStyle = "#0a0a20";
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

		// Draw based on game type
		switch (this.currentGame) {
			case "racing":
				this.renderRacing();
				break;
			case "battle":
				this.renderBattle();
				break;
			case "quiz":
				this.renderQuiz();
				break;
		}

		// Draw players
		this.renderPlayers();
	}

	renderRacing() {
		if (!this.raceTrack) return;

		const ctx = this.ctx;

		// Draw track circle
		ctx.beginPath();
		ctx.arc(
			this.raceTrack.center.x,
			this.raceTrack.center.y,
			this.raceTrack.radius,
			0,
			Math.PI * 2,
		);
		ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
		ctx.lineWidth = 60;
		ctx.stroke();

		// Draw checkpoints
		this.raceTrack.checkpoints.forEach((cp, index) => {
			ctx.beginPath();
			ctx.arc(cp.x, cp.y, cp.radius, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(0, 255, 255, 0.3)`;
			ctx.fill();
			ctx.strokeStyle = "#00ffff";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Checkpoint number
			ctx.fillStyle = "#fff";
			ctx.font = "bold 16px Arial";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText((index + 1).toString(), cp.x, cp.y);
		});
	}

	renderBattle() {
		const ctx = this.ctx;

		// Draw arena border
		ctx.strokeStyle = "rgba(255, 0, 100, 0.5)";
		ctx.lineWidth = 5;
		ctx.strokeRect(20, 20, this.canvas.width - 40, this.canvas.height - 40);

		// Draw attack effects
		this.battleEffects.forEach((effect) => {
			ctx.beginPath();
			ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
			ctx.strokeStyle = effect.color;
			ctx.lineWidth = 3;
			ctx.globalAlpha = effect.alpha;
			ctx.stroke();
			ctx.globalAlpha = 1;
		});
	}

	renderQuiz() {
		if (!this.quizData) return;

		const ctx = this.ctx;
		const question = this.quizData.questions[this.quizData.currentIndex];

		// Question box
		const boxWidth = Math.min(800, this.canvas.width - 100);
		const boxX = (this.canvas.width - boxWidth) / 2;
		const boxY = 150;

		ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
		ctx.fillRect(boxX, boxY, boxWidth, 200);
		ctx.strokeStyle = "#00ffff";
		ctx.lineWidth = 3;
		ctx.strokeRect(boxX, boxY, boxWidth, 200);

		// Question text
		ctx.fillStyle = "#fff";
		ctx.font = "bold 28px Arial";
		ctx.textAlign = "center";
		ctx.fillText(question.q, this.canvas.width / 2, boxY + 60);

		// Options
		const optionLabels = ["A", "B", "C", "D"];
		const optionColors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4"];

		question.options.forEach((option, i) => {
			const col = i % 2;
			const row = Math.floor(i / 2);
			const optX = boxX + 50 + col * (boxWidth / 2 - 30);
			const optY = boxY + 100 + row * 45;

			ctx.fillStyle = optionColors[i];
			ctx.font = "bold 20px Arial";
			ctx.textAlign = "left";
			ctx.fillText(`${optionLabels[i]}: ${option}`, optX, optY);
		});

		// Timer bar
		const timerWidth = (this.quizData.questionTimer / 100) * boxWidth;
		ctx.fillStyle = "#00ffff";
		ctx.fillRect(boxX, boxY + 190, timerWidth, 10);
	}

	renderPlayers() {
		const ctx = this.ctx;

		Object.values(this.gameObjects).forEach((obj) => {
			ctx.save();
			ctx.translate(obj.x, obj.y);

			// Boost effect
			if (obj.boost) {
				ctx.shadowColor = obj.color;
				ctx.shadowBlur = 30;
			}

			// Player circle
			ctx.beginPath();
			ctx.arc(0, 0, obj.width / 2, 0, Math.PI * 2);
			ctx.fillStyle = obj.color;
			ctx.fill();
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = 3;
			ctx.stroke();

			// Player initial
			ctx.fillStyle = "#fff";
			ctx.font = "bold 24px Arial";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(obj.name.charAt(0).toUpperCase(), 0, 0);

			// Health bar (for battle)
			if (this.currentGame === "battle") {
				const barWidth = 50;
				const barHeight = 6;
				const healthPercent = obj.health / obj.maxHealth;

				ctx.fillStyle = "#333";
				ctx.fillRect(-barWidth / 2, -obj.height / 2 - 15, barWidth, barHeight);
				ctx.fillStyle =
					healthPercent > 0.5
						? "#00ff00"
						: healthPercent > 0.25
							? "#ffff00"
							: "#ff0000";
				ctx.fillRect(
					-barWidth / 2,
					-obj.height / 2 - 15,
					barWidth * healthPercent,
					barHeight,
				);
			}

			// Name label
			ctx.fillStyle = "#fff";
			ctx.font = "14px Arial";
			ctx.fillText(obj.name, 0, obj.height / 2 + 20);

			ctx.restore();
		});
	}

	updateScoreDisplay() {
		const container = document.getElementById("game-scores");
		if (!container) return;

		const sortedPlayers = Object.values(this.gameObjects).sort(
			(a, b) => b.score - a.score,
		);

		container.innerHTML = sortedPlayers
			.map(
				(player) => `
            <div class="score-item" style="border-left-color: ${player.color}">
                <span class="name">${player.name}</span>
                <span class="points">${player.score}</span>
            </div>
        `,
			)
			.join("");
	}

	/* ----------------------------------------
       GAME END
    ---------------------------------------- */
	endGame() {
		this.gamePhase = "results";

		// Stop timer and game loop
		if (this.timerInterval) clearInterval(this.timerInterval);
		if (this.animationFrame) cancelAnimationFrame(this.animationFrame);

		// Calculate results
		const results = Object.values(this.gameObjects)
			.map((obj) => ({
				id: obj.id,
				name: obj.name,
				color: obj.color,
				score: obj.score,
			}))
			.sort((a, b) => b.score - a.score);

		// Show results
		this.showResults(results);

		// Notify all players
		this.socket.emit("game: end", results);
	}

	showResults(results) {
		this.showScreen("results-screen");

		const container = document.getElementById("results-list");
		const positionEmojis = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️��"];

		container.innerHTML = results
			.map(
				(player, index) => `
            <div class="result-item" style="border-left-color: ${player.color}; animation-delay: ${index * 0.1}s">
                <span class="result-position">${positionEmojis[index] || index + 1}</span>
                <span class="result-name">${player.name}</span>
                <span class="result-score">${player.score}</span>
            </div>
        `,
			)
			.join("");
	}

	returnToLobby() {
		this.gamePhase = "lobby";
		this.currentGame = null;
		this.selectedGame = null;

		// Stop game
		if (this.timerInterval) clearInterval(this.timerInterval);
		if (this.animationFrame) cancelAnimationFrame(this.animationFrame);

		// Reset timer display
		document.getElementById("game-timer").style.color = "#00ffff";

		// Clear selection
		document
			.querySelectorAll(".game-btn")
			.forEach((b) => b.classList.remove("selected"));
		document.getElementById("start-section").classList.add("hidden");

		// Show lobby
		this.showScreen("lobby-screen");

		// Reload QR
		this.loadQRCode();
	}
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	window.display = new PartyGameDisplay();
});
