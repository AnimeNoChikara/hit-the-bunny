import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import "./App.css";

// ⚠️ Pastikan file audio ini ada di src/assets/
// Atau ganti path/namanya kalau beda.
import hitSfx from "./assets/hit.wav";
import missSfx from "./assets/miss.mp3";
import bunnyImg from "./assets/bunny.png";

// Kalau kamu sudah punya supabaseClient.ts, pakai import ini:
import { supabase } from "./lib/supabaseClient";

// ---------- Konstanta game ----------
const HOLES_COUNT = 9;
const GAME_DURATION = 30; // detik
const BUNNY_INTERVAL = 700; // ms

// ---------- Tipe data ----------
type MiniAppUser = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

type LeaderboardEntry = {
  fid: number;
  username: string | null;
  display_name: string | null;
  best_score: number;
};

// ---------- Komponen utama ----------
function App() {
  // State user Farcaster
  const [currentUser, setCurrentUser] = useState<MiniAppUser | null>(null);

  // State game
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);
  const [activeHole, setActiveHole] = useState<number | null>(null);

  // Timer refs
  const timerRef = useRef<number | null>(null);
  const bunnyRef = useRef<number | null>(null);

  // Audio refs
  const bunnyPopRef = useRef<HTMLAudioElement | null>(null);
  const hitRef = useRef<HTMLAudioElement | null>(null);
  const missRef = useRef<HTMLAudioElement | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

    // Reward BUNNY (offchain)
  const [lastRewardPoints, setLastRewardPoints] = useState(0);
  const [unclaimedPoints, setUnclaimedPoints] = useState(0);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);


  // Tambahkan ini:
  const scoreRef = useRef(0);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  //------------ Supabase: grant reward ----------
  const grantRewardForGame = async () => {
    if (!currentUser) {
      console.warn("[grantRewardForGame] no user, skip");
      return;
    }

    const finalScore = scoreRef.current;
    if (finalScore <= 0) {
      console.log("[grantRewardForGame] score 0, tidak ada reward");
      return;
    }

    const points = calcRewardPointsFromScore(finalScore);
    const fid = currentUser.fid;
    const username = currentUser.username ?? null;
    const displayName = currentUser.displayName ?? null;

    try {
      // Update player_rewards
      const { data, error } = await supabase
        .from("player_rewards")
        .upsert(
          {
            fid,
            username,
            display_name: displayName,
            // tambahkan ke unclaimed & total_earned
            unclaimed_points: (unclaimedPoints || 0) + points,
            total_earned: points, // akan kita adjust di bawah
            updated_at: new Date().toISOString(),
          },
          { onConflict: "fid" }
        )
        .select("unclaimed_points, total_earned")
        .single();

      if (error) {
        console.error("[grantRewardForGame] upsert player_rewards error:", error);
        return;
      }

      // Lebih rapi: pakai RPC / trigger untuk increment,
      // tapi untuk contoh simple kita bisa lakukan cara lain:
      // Alternatif yang lebih aman: fetch dulu row sekarang, lalu hitung manual dan upsert.
      // Di sini supaya pendek, kita asumsikan unclaimedPoints state sudah up to date.

      setLastRewardPoints(points);
      setUnclaimedPoints(data.unclaimed_points ?? (unclaimedPoints + points));
      setIsRewardModalOpen(true);

      // Opsional: log event per game
      await supabase.from("reward_events").insert({
        fid,
        points,
        score: finalScore,
      });
    } catch (e) {
      console.error("[grantRewardForGame] unexpected error:", e);
    }
  };

  // ---------- Supabase: rewards ----------
  const refreshRewards = async () => {
    if (!currentUser) return;

    const { data, error } = await supabase
      .from("player_rewards")
      .select("unclaimed_points, total_earned, total_claimed")
      .eq("fid", currentUser.fid)
      .maybeSingle();

    if (error) {
      console.warn("[refreshRewards] error:", error);
      return;
    }

    if (data) {
      setUnclaimedPoints(data.unclaimed_points ?? 0);
    } else {
      setUnclaimedPoints(0);
    }
  };

  const calcRewardPointsFromScore = (finalScore: number) => {
    // bebas: misal 10 BUNNY point per 1 skor
    return finalScore * 10;
  };
  



  // ---------- INIT: miniapp + user + audio ----------
  useEffect(() => {
    const init = async () => {
      console.log("[init] start");

      // 1. Kasih sinyal ke host (Farcaster/Base) kalau UI siap.
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.warn(
          "[init] sdk.actions.ready error (ini wajar kalau di localhost bukan miniapp):",
          e
        );
      }

      // 2. Coba ambil context user kalau memang di dalam miniapp
      try {
        const inMiniApp = await sdk.isInMiniApp();
        console.log("[init] isInMiniApp =", inMiniApp);

        if (inMiniApp) {
          const context = await sdk.context; // Promise, jadi WAJIB di-await
          if (context?.user?.fid) {
            const u = context.user as MiniAppUser;
            setCurrentUser({
              fid: u.fid,
              username: u.username,
              displayName: u.displayName,
              pfpUrl: u.pfpUrl,
            });
            await refreshRewards();
            console.log("[init] User dari Farcaster:", u);
          } else {
            console.log("[init] Context ada tapi user kosong");
          }
        } else {
          console.log("[init] Tidak berjalan di dalam Farcaster/Base miniapp (localhost mode)");
        }
      } catch (e) {
        console.warn("[init] gagal ambil sdk.context:", e);
      }

      // 3. Init audio (supaya tidak bikin error saat dipakai)
      hitRef.current = new Audio(hitSfx);
      if (hitRef.current) hitRef.current.volume = 0.8;

      missRef.current = new Audio(missSfx);
      if (missRef.current) missRef.current.volume = 0.4;

      console.log("[init] done");
    };

    void init();
  }, []);

  // ---------- Timer countdown (auto game over) ----------
  useEffect(() => {
    if (!isPlaying) return;

    if (timerRef.current) window.clearInterval(timerRef.current);

    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          void stopGame();  // 🟢 ini penting
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isPlaying]); // ini boleh tetap seperti ini


  // ---------- Bunny bergerak ----------
  useEffect(() => {
    if (!isPlaying) return;

    if (bunnyRef.current) window.clearInterval(bunnyRef.current);

    bunnyRef.current = window.setInterval(() => {
      const randomIndex = Math.floor(Math.random() * HOLES_COUNT);
      setActiveHole(randomIndex);

      if (bunnyPopRef.current) {
        bunnyPopRef.current.currentTime = 0;
        bunnyPopRef.current
          .play()
          .catch(() => {
            // ignore autoplay error
          });
      }
    }, BUNNY_INTERVAL);

    return () => {
      if (bunnyRef.current) window.clearInterval(bunnyRef.current);
    };
  }, [isPlaying]);

  // ---------- Supabase: load leaderboard saat modal dibuka ----------
  useEffect(() => {
    if (!isLeaderboardOpen) return;
    void refreshLeaderboard();
  }, [isLeaderboardOpen]);

  // ---------- Actions game ----------
  const startGame = () => {
    if (!currentUser) {
      alert("Buka game ini lewat Farcaster/Base biar akunmu terbaca dulu 🟣");
      return;
    }

    setScore(0);
    setTimeLeft(GAME_DURATION);
    setIsPlaying(true);
  };

  const stopGame = async () => {
    console.log("[stopGame] dipanggil, score (state):", scoreRef.current);

    setIsPlaying(false);
    setActiveHole(null);

    if (timerRef.current) window.clearInterval(timerRef.current);
    if (bunnyRef.current) window.clearInterval(bunnyRef.current);

    await saveScoreToLeaderboard();
    await grantRewardForGame();       // beri reward & popup
  };


  const handleHoleClick = (index: number) => {
    if (!isPlaying) return;

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

  // ---------- Supabase: leaderboard ----------
  const refreshLeaderboard = async () => {
    console.log("[refreshLeaderboard] load leaderboard");
    const { data, error } = await supabase
      .from("leaderboard")
      .select("fid, username, display_name, best_score")
      .order("best_score", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[refreshLeaderboard] error:", error);
      return;
    }

    console.log("[refreshLeaderboard] data:", data);
    setLeaderboard(data as LeaderboardEntry[]);
  };

  const saveScoreToLeaderboard = async () => {
    const finalScore = scoreRef.current; // 🟢 ambil skor terbaru dari ref

    console.log("[saveScoreToLeaderboard] mulai, user:", currentUser, "score:", finalScore);

    if (!currentUser) {
      console.warn("[saveScoreToLeaderboard] currentUser kosong → tidak simpan");
      return;
    }

    if (finalScore <= 0) {
      console.warn("[saveScoreToLeaderboard] score <= 0 → tidak simpan");
      return;
    }

    const fid = currentUser.fid;
    const username = currentUser.username ?? null;
    const displayName = currentUser.displayName ?? null;

    try {
      const { data: existing, error: fetchError } = await supabase
        .from("leaderboard")
        .select("best_score")
        .eq("fid", fid)
        .maybeSingle();

      if (fetchError) {
        console.error("[saveScoreToLeaderboard] gagal baca leaderboard:", fetchError);
        return;
      }

      const existingBest = existing?.best_score ?? 0;
      console.log(
        "[saveScoreToLeaderboard] best lama:",
        existingBest,
        "score baru:",
        finalScore
      );

      if (finalScore <= existingBest) {
        console.log("[saveScoreToLeaderboard] score baru tidak lebih tinggi, skip update");
        return;
      }

      const { error: upsertError } = await supabase
        .from("leaderboard")
        .upsert(
          {
            fid,
            username,
            display_name: displayName,
            best_score: finalScore,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "fid" }
        );

      if (upsertError) {
        console.error("[saveScoreToLeaderboard] upsert error:", upsertError);
        return;
      }

      console.log("[saveScoreToLeaderboard] upsert sukses");
      await refreshLeaderboard();
    } catch (e) {
      console.error("[saveScoreToLeaderboard] error tak terduga:", e);
    }
  };



    // ---------- UI ----------
  return (
    <div className="app">
      {/* Top bar */}
      <header className="top-bar">
        
        <div className="player-row">
          {currentUser ? (
            <div className="player-info">
              <div className="player-name">
                {currentUser.displayName ||
                  currentUser.username ||
                  `User #${currentUser.fid}`}
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
          
        <button
          className="trophy-btn"
          onClick={handleOpenLeaderboard}
          aria-label="Lihat leaderboard"
        >
          🏆
        </button>
      </header>

      {/* Panel info user + timer */}
      <section className="panel">
        <div className="top-left">
          <h1 className="title"></h1>
          <p className="subtitle"></p>
        </div>
        <div className="info-bar">
          <div className="info-item">
            <span className="info-label">Time</span>
            <span className="info-value">{timeLeft}s</span>
          </div>
          <div className="info-item">
            <span className="info-label">Score</span>
            <span className="info-value">{score}</span>
          </div>
        </div>

        <div className="progress-wrapper">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* Kartu game */}
      <main className="game-card">
        <div className="grid">
          {Array.from({ length: HOLES_COUNT }).map((_, index) => (
           <button
              key={index}
              className={`hole ${activeHole === index ? "active" : ""}`}
              onClick={() => handleHoleClick(index)}
            >
              {activeHole === index && (
                <img
                  src={bunnyImg}
                  alt="Bunny"
                  className="bunny bunny-in bunny-img"
                  draggable={false}
                />
              )}
            </button>
          ))}
        </div>

        {/* Hanya tombol Mulai/Main Lagi, tidak ada tombol Selesai */}
        <div className="controls">
          {!isPlaying && (
            <button className="primary-btn" onClick={startGame}>
              {timeLeft === 0 ? "Play Again" : "Play game"}
            </button>
          )}
        </div>

        {!isPlaying && timeLeft === 0 && (
          <p className="result-text">Game over! Skor kamu: {score}</p>
        )}
      </main>

      {/* Modal leaderboard */}
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
      {isRewardModalOpen && (
      <div
        className="modal-backdrop"
        onClick={() => setIsRewardModalOpen(false)}
      >
        <div
          className="modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 className="modal-title">Selamat! 🎉</h2>
            <button
              className="modal-close"
              onClick={() => setIsRewardModalOpen(false)}
            >
              ✕
            </button>
          </div>

          <p className="modal-text">
            Kamu baru saja mendapatkan{" "}
            <strong>{lastRewardPoints}</strong> BUNNY points dari skor game ini!
          </p>
          <p className="modal-text">
            Total BUNNY points yang belum kamu klaim:{" "}
            <strong>{unclaimedPoints}</strong>
          </p>

          <button
            className="primary-btn"
            onClick={() => {
              setIsRewardModalOpen(false);
              // nanti di sini bisa buka panel "Wallet" atau tab claim
            }}
          >
            Keren! ✨
          </button>
        </div>
      </div>
    )}
      {/* <button
        className="secondary-btn"
        onClick={() => {
          setIsRewardModalOpen(false);
          // buka panel wallet / claim
        }}>
        Lihat Dompet BUNNY
      </button> */}

    </div>
  );
}

export default App;
