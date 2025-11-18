import { useEffect, useState, useRef } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import "./App.css";
import hitSfx from "./assets/hit.wav";
import missSfx from "./assets/miss.mp3";
import { supabase } from "./lib/supabaseClient";

type LeaderboardEntry = {
  fid: number;
  username: string | null;
  display_name: string | null;
  best_score: number;
};

//const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);


const HOLES_COUNT = 9;
const GAME_DURATION = 30; // detik
const BUNNY_INTERVAL = 700; // ms
const LEADERBOARD_KEY = "bunny_hit_leaderboard";


// di atas, dekat type LeaderboardEntry
type MiniAppUser = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};


function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);
  const [activeHole, setActiveHole] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

  const timerRef = useRef<number | null>(null);
  const bunnyRef = useRef<number | null>(null);

  const bunnyPopRef = useRef<HTMLAudioElement | null>(null);
  const hitRef = useRef<HTMLAudioElement | null>(null);
  const missRef = useRef<HTMLAudioElement | null>(null);

  const [currentUser, setCurrentUser] = useState<MiniAppUser | null>(null);

  useEffect(() => {
    const init = async () => {
      // 0. Log dulu biar tahu efeknya jalan
      console.log("Init miniapp effect start");

      // 1. Jangan biarkan error sdk bikin app blank
      try {
        // Ini cuma kasih sinyal ke host kalau UI siap.
        // Di browser biasa (localhost), kalau gagal ya sudah, kita abaikan saja.
        await sdk.actions.ready();
      } catch (e) {
        console.warn("miniapp sdk ready() error (boleh diabaikan di localhost):", e);
      }

      // 2. Coba baca context TAPI jangan paksa, kalau gagal ya skip
      try {
        // sdk.context adalah Promise → WAJIB di-await
        const context = await sdk.context; // <— perbaikan utama di sini

        if (context?.user?.fid) {
          const ctxUser = context.user as MiniAppUser;
          setCurrentUser({
            fid: ctxUser.fid,
            username: ctxUser.username,
            displayName: ctxUser.displayName,
            pfpUrl: ctxUser.pfpUrl,
          });
          console.log("Miniapp user ditemukan:", ctxUser);
        } else {
          console.log("Context ada, tapi user kosong (mungkin bukan dibuka dari mini app)");
        }
      } catch (e) {
        // Di localhost wajar kalau ini error, yang penting jangan sampai app crash
        console.warn("Tidak bisa baca sdk.context (wajar kalau di localhost):", e);
      }

      console.log("Init miniapp effect end");
    };

    void init();
  }, []);


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
          // waktu habis → otomatis akhiri game + simpan skor
          void stopGame();  // <— PENTING: panggil di sini
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
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
    if (!currentUser) {
      alert("Buka game ini lewat Farcaster/Base dulu supaya kami bisa baca akunmu 🟣");
      return;
    }

    setScore(0);
    setTimeLeft(GAME_DURATION);
    setIsPlaying(true);
  };

  const stopGame = async () => {
    console.log("[stopGame] dipanggil, score:", score);

    setIsPlaying(false);
    setActiveHole(null);

    if (timerRef.current) window.clearInterval(timerRef.current);
    if (bunnyRef.current) window.clearInterval(bunnyRef.current);

    await saveScoreToLeaderboard(); // <— ini yang nyimpan ke Supabase
  };

  const saveScoreToLeaderboard = async () => {
    console.log("[saveScoreToLeaderboard] mulai, currentUser:", currentUser, "score:", score);

    if (!currentUser) {
      console.warn("[saveScoreToLeaderboard] currentUser kosong → tidak simpan skor");
      return;
    }

    if (score <= 0) {
      console.warn("[saveScoreToLeaderboard] score <= 0 → tidak simpan skor");
      return;
    }

    const fid = currentUser.fid;
    const username = currentUser.username ?? null;
    const displayName = currentUser.displayName ?? null;

    try {
      // 1. Ambil skor lama user ini
      const { data: existing, error: fetchError } = await supabase
        .from("leaderboard")
        .select("best_score")
        .eq("fid", fid)
        .maybeSingle();

      if (fetchError) {
        console.error("[saveScoreToLeaderboard] Gagal baca leaderboard:", fetchError);
        return;
      }

      const existingBest = existing?.best_score ?? 0;
      console.log("[saveScoreToLeaderboard] best lama:", existingBest, "score baru:", score);

      if (score <= existingBest) {
        console.log("[saveScoreToLeaderboard] score baru tidak lebih besar, skip update");
        return;
      }

      // 2. Upsert (1 user = 1 baris, update kalau ada)
      const { error: upsertError } = await supabase
        .from("leaderboard")
        .upsert(
          {
            fid,
            username,
            display_name: displayName,
            best_score: score,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "fid" }
        );

      if (upsertError) {
        console.error("[saveScoreToLeaderboard] Gagal upsert leaderboard:", upsertError);
        return;
      }

      console.log("[saveScoreToLeaderboard] Upsert sukses");

      // 3. Refresh daftar leaderboard (misal top 20)
      await refreshLeaderboard();
    } catch (e) {
      console.error("[saveScoreToLeaderboard] Error tak terduga:", e);
    }
  };


  const refreshLeaderboard = async () => {
    console.log("[refreshLeaderboard] load leaderboard");
    const { data, error } = await supabase
      .from("leaderboard")
      .select("fid, username, display_name, best_score")
      .order("best_score", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[refreshLeaderboard] Gagal load leaderboard:", error);
      return;
    }

    console.log("[refreshLeaderboard] data:", data);
    setLeaderboard(data as LeaderboardEntry[]);
  };

    useEffect(() => {
    if (!isLeaderboardOpen) return;
    void refreshLeaderboard();
  }, [isLeaderboardOpen]);


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

      <section className="panel">
        <div className="player-row">
          {currentUser ? (
            <div className="player-info">
              <div className="player-name">
                {currentUser.displayName || currentUser.username || `User #${currentUser.fid}`}
              </div>
              <div className="player-handle">
                @{currentUser.username ?? "unknown"} · fid {currentUser.fid}
              </div>
            </div>
          ) : (
            <div className="player-info">
              <div className="player-name">Guest</div>
              <div className="player-handle">
                Jalankan di Farcaster/Base untuk auto login
              </div>
            </div>
          )}
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
          {!isPlaying && (
            <button className="primary-btn" onClick={startGame}>
              {timeLeft === 0 ? "Main Lagi" : "Mulai Game"}
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
                  <li key={entry.fid} className="leaderboard-item">
                    <span className="lb-rank">{index + 1}</span>
                    <span className="lb-name">
                      {entry.display_name || entry.username || `fid ${entry.fid}`}
                    </span>
                    <span className="lb-score">{entry.best_score}</span>
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
