// src/App.tsx
import { useEffect, useState, useRef } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import "./App.css";

const HOLES_COUNT = 9;
const GAME_DURATION = 30; // detik
const BUNNY_INTERVAL = 700; // ms

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);
  const [activeHole, setActiveHole] = useState<number | null>(null);

  const timerRef = useRef<number | null>(null);
  const bunnyRef = useRef<number | null>(null);

  // Panggil sdk.actions.ready() setelah UI siap
  useEffect(() => {
    const callReady = async () => {
      try {
        // Di luar environment mini app biasanya ini aman-aman saja (no-op)
        await sdk.actions.ready();
      } catch (e) {
        console.warn("miniapp sdk ready() error (mungkin bukan di Farcaster/Base):", e);
      }
    };

    callReady();
  }, []);

  // Logika countdown
  useEffect(() => {
    if (!isPlaying) return;

    timerRef.current && window.clearInterval(timerRef.current);
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

  // Logika perpindahan bunny
  useEffect(() => {
    if (!isPlaying) return;

    bunnyRef.current && window.clearInterval(bunnyRef.current);
    bunnyRef.current = window.setInterval(() => {
      const randomIndex = Math.floor(Math.random() * HOLES_COUNT);
      setActiveHole(randomIndex);
    }, BUNNY_INTERVAL);

    return () => {
      if (bunnyRef.current) window.clearInterval(bunnyRef.current);
    };
  }, [isPlaying]);

  const startGame = () => {
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setIsPlaying(true);
  };

  const stopGame = () => {
    setIsPlaying(false);
    setActiveHole(null);
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (bunnyRef.current) window.clearInterval(bunnyRef.current);
  };

  const handleHoleClick = (index: number) => {
    if (!isPlaying) return;
    if (index === activeHole) {
      setScore((s) => s + 1);
      setActiveHole(null); // supaya tidak bisa di-click berkali2
    }
  };

  return (
    <div className="app">
      <h1 className="title">Bunny Hit the Hole 🐰</h1>

      <div className="info-bar">
        <div>⏱ Time: {timeLeft}s</div>
        <div>⭐ Score: {score}</div>
      </div>

      <div className="grid">
        {Array.from({ length: HOLES_COUNT }).map((_, index) => (
          <button
            key={index}
            className={`hole ${activeHole === index ? "active" : ""}`}
            onClick={() => handleHoleClick(index)}
          >
            {activeHole === index ? "🐰" : ""}
          </button>
        ))}
      </div>

      <div className="controls">
        {!isPlaying ? (
          <button className="primary-btn" onClick={startGame}>
            {timeLeft === 0 ? "Play Again" : "Start Game"}
          </button>
        ) : (
          <button className="secondary-btn" onClick={stopGame}>
            Stop
          </button>
        )}
      </div>

      {!isPlaying && timeLeft === 0 && (
        <p className="result-text">Game over! Skor kamu: {score}</p>
      )}
    </div>
  );
}

export default App;
