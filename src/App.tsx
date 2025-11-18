import { useEffect, useState, useRef } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import "./App.css";

import hitSfx from "./assets/hit.wav";
import missSfx from "./assets/miss.mp3";

const HOLES_COUNT = 9;
const GAME_DURATION = 30; // detik
const BUNNY_INTERVAL = 700; // ms
const LEADERBOARD_KEY = "bunny_hit_leaderboard";

type LeaderboardEntry = {
  name: string;
  score: number;
};

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);
  const [activeHole, setActiveHole] = useState<number | null>(null);

  const [playerName, setPlayerName] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

  const timerRef = useRef<number | null>(null);
  const bunnyRef = useRef<number | null>(null);

  const bunnyPopRef = useRef<HTMLAudioElement | null>(null);
  const hitRef = useRef<HTMLAudioElement | null>(null);
  const missRef = useRef<HTMLAudioElement | null>(null);

  // Miniapp ready
  useEffect(() => {
    const callReady = async () => {
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.warn("miniapp sdk ready() error (mungkin bukan di Farcaster/Base):", e);
      }
    };

    callReady();
  }, []);

  // Init audio & leaderboard
  useEffect(() => {
    hitRef.current = new Audio(hitSfx);
    hitRef.current.volume = 0.8;

    missRef.current = new Audio(missSfx);
    missRef.current.volume = 0.4;

    try {
      const raw = window.localStorage.getItem(LEADERBOARD_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LeaderboardEntry[];
        setLeaderboard(parsed);
      }
    } catch (e) {
      console.warn("Failed to load leaderboard:", e);
    }
  }, []);

  // Countdown
  useEffect(() => {
    if (!isPlaying) return;

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          stopGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Bunny muncul random
  useEffect(() => {
    if (!isPlaying) return;

    if (bunnyRef.current) window.clearInterval(bunnyRef.current);
    bunnyRef.current = window.setInterval(() => {
      const randomIndex = Math.floor(Math.random() * HOLES_COUNT);
      setActiveHole(randomIndex);
      if (bunnyPopRef.current) {
        bunnyPopRef.current.currentTime = 0;
        bunnyPopRef.current.play().catch(() => {});
      }
    }, BUNNY_INTERVAL);

    return () => {
      if (bunnyRef.current) window.clearInterval(bunnyRef.current);
    };
  }, [isPlaying]);

  const startGame = () => {
    if (!playerName.trim()) {
      alert("Isi nama dulu sebelum mulai ya! 🐰");
      return;
    }
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setIsPlaying(true);
  };

  const stopGame = () => {
    setIsPlaying(false);
    setActiveHole(null);
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (bunnyRef.current) window.clearInterval(bunnyRef.current);
    saveScoreToLeaderboard();
  };

  const saveScoreToLeaderboard = () => {
    if (!playerName.trim() || score <= 0) return;

    setLeaderboard((prev) => {
      // Cek kalau nama sudah ada → update kalau skor baru lebih tinggi
      const existingIndex = prev.findIndex(
        (entry) => entry.name.toLowerCase() === playerName.trim().toLowerCase()
      );

      let updated: LeaderboardEntry[];

      if (existingIndex !== -1) {
        const currentEntry = prev[existingIndex];
        const bestScore = Math.max(currentEntry.score, score);
        updated = [
          ...prev.slice(0, existingIndex),
          { ...currentEntry, score: bestScore },
          ...prev.slice(existingIndex + 1),
        ];
      } else {
        updated = [...prev, { name: playerName.trim(), score }];
      }

      // Sort desc by score
      updated.sort((a, b) => b.score - a.score);

      try {
        window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn("Failed to save leaderboard:", e);
      }

      return updated;
    });
  };

  const handleHoleClick = (index: number) => {
    if (!isPlaying) {
      return;
    }

    if (index === activeHole) {
      setScore((s) => s + 1);
      setActiveHole(null);

      if (hitRef.current) {
        hitRef.current.currentTime = 0;
        hitRef.current.play().catch(() => {});
      }
    } else {
      if (missRef.current) {
        missRef.current.currentTime = 0;
        missRef.current.play().catch(() => {});
      }
    }
  };

  const handleOpenLeaderboard = () => {
    setIsLeaderboardOpen(true);
  };

  const handleCloseLeaderboard = () => {
    setIsLeaderboardOpen(false);
  };

  const progressPercent = (timeLeft / GAME_DURATION) * 100;

  return (
    <div className="app">
      {/* Top bar */}
      <header className="top-bar">
        <div className="top-left">
          <h1 className="title">Bunny Hit the Hole 🐰</h1>
          <p className="subtitle">Tap cepat, kejar skor tertinggi!</p>
        </div>

        <button
          className="trophy-btn"
          onClick={handleOpenLeaderboard}
          aria-label="Lihat leaderboard"
        >
          🏆
        </button>
      </header>

      {/* Name + info bar */}
      <section className="panel">
        <div className="player-row">
          <label className="player-label">
            Nama:
            <input
              type="text"
              className="player-input"
              placeholder="Masukkan nama kamu"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              disabled={isPlaying}
            />
          </label>
        </div>

        <div className="info-bar">
          <div className="info-item">
            <span className="info-label">Waktu</span>
            <span className="info-value">{timeLeft}s</span>
          </div>
          <div className="info-item">
            <span className="info-label">Skor</span>
            <span className="info-value">{score}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="progress-wrapper">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* Game grid */}
      <main className="game-card">
        <div className="grid">
          {Array.from({ length: HOLES_COUNT }).map((_, index) => (
            <button
              key={index}
              className={`hole ${activeHole === index ? "active" : ""}`}
              onClick={() => handleHoleClick(index)}
            >
              <span className={`bunny ${activeHole === index ? "bunny-in" : "bunny-out"}`}>
                {activeHole === index ? "🐰" : ""}
              </span>
            </button>
          ))}
        </div>

        <div className="controls">
          {!isPlaying ? (
            <button className="primary-btn" onClick={startGame}>
              {timeLeft === 0 ? "Main Lagi" : "Mulai Game"}
            </button>
          ) : (
            <button className="secondary-btn" onClick={stopGame}>
              Selesai
            </button>
          )}
        </div>

        {!isPlaying && timeLeft === 0 && (
          <p className="result-text">Game over! Skor kamu: {score}</p>
        )}
      </main>

      {/* Leaderboard modal */}
      {isLeaderboardOpen && (
        <div className="modal-backdrop" onClick={handleCloseLeaderboard}>
          <div
            className="modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="modal-header">
              <h2 className="modal-title">Leaderboard 🏆</h2>
              <button
                className="modal-close"
                onClick={handleCloseLeaderboard}
                aria-label="Tutup leaderboard"
              >
                ✕
              </button>
            </div>

            {leaderboard.length === 0 ? (
              <p className="modal-empty">Belum ada skor. Jadilah yang pertama!</p>
            ) : (
              <ul className="leaderboard-list">
                {leaderboard.map((entry, index) => (
                  <li key={entry.name} className="leaderboard-item">
                    <span className="lb-rank">{index + 1}</span>
                    <span className="lb-name">{entry.name}</span>
                    <span className="lb-score">{entry.score}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
