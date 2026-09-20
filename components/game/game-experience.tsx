"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Construction,
  Hammer,
  Home,
  Music,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Sparkles,
  Trophy,
  Upload,
  Users,
  Volume2,
  VolumeX,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cellStage } from "@/lib/mock-game";
import { isSupabaseConfigured, loadSession, resetGameState, saveGameState, subscribeToGameState } from "@/lib/game-service";
import type { GameSession, GameState, Question, TeamMember } from "@/lib/game-types";

type Point = { x: number; y: number };
type BuilderPhase = "idle" | "running" | "hammering" | "celebrating" | "sad";
type ResultMessage = { kind: "success" | "error"; title: string; body: string } | null;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value: string) => value.trim().toLocaleLowerCase("vi").replace(/[.!?]+$/g, "");

function playSound(kind: "steps" | "hammer" | "success" | "crack" | "fanfare") {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const notes =
      kind === "fanfare"
        ? [392, 523, 659, 784, 1047]
        : kind === "success"
        ? [523, 659, 784]
        : kind === "crack"
        ? [180, 110, 70]
        : kind === "hammer"
        ? [240, 180, 240]
        : [120, 150, 120, 150];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === "crack" ? "sawtooth" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + index * 0.14 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.14 + 0.11);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * 0.14);
      oscillator.stop(context.currentTime + index * 0.14 + 0.13);
    });
    window.setTimeout(() => void context.close(), 1200);
  } catch {
    /* Audio is enhancement-only. */
  }
}

export function GameExperience({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<GameSession | null>(null);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [duration, setDuration] = useState(900);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [phase, setPhase] = useState<BuilderPhase>("idle");
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [activeMember, setActiveMember] = useState<TeamMember | null>(null);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [symbolicOpen, setSymbolicOpen] = useState(false);
  const [result, setResult] = useState<ResultMessage>(null);
  const [answer, setAnswer] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedTargetIndex, setSelectedTargetIndex] = useState<number | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Trạng thái kiểm tra trực quan câu hỏi
  const [quizState, setQuizState] = useState<"answering" | "submitted">("answering");
  const [isCorrectResult, setIsCorrectResult] = useState<boolean | null>(null);

  // Trạng thái Đoán Bức tranh bí mật riêng biệt (không kết thúc ván chơi)
  const [guessPictureOpen, setGuessPictureOpen] = useState(false);
  const [guessInput, setGuessInput] = useState("");
  const [hasGuessedCorrectly, setHasGuessedCorrectly] = useState(false);
  const [guessedName, setGuessedName] = useState("");
  const [guessFeedback, setGuessFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [showFireworks, setShowFireworks] = useState(false);

  // Nhạc nền
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicInput, setMusicInput] = useState("");
  const [musicOpen, setMusicOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const musicFileRef = useRef<HTMLInputElement | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let mounted = true;
    void loadSession(sessionId)
      .then((loaded) => {
        if (!mounted) return;
        setSession(loaded);
        setSelectedMemberId(loaded.members[0]?.id ?? "");
        setActiveMember(loaded.members[0] ?? null);
        // Restore persisted guess state
        if (loaded.state.hasGuessedCorrectly) {
          setHasGuessedCorrectly(true);
          setGuessedName(loaded.state.guessedName ?? "");
        }
        // Restore persisted music URL
        if (loaded.state.bgMusicUrl) {
          setMusicUrl(loaded.state.bgMusicUrl);
          setMusicInput(loaded.state.bgMusicUrl);
        }
      })
      .catch((error) =>
        setLoadError(error instanceof Error ? error.message : "Không thể tải phiên chơi")
      );
    const unsubscribe = subscribeToGameState(sessionId, (state) => {
      setSession((current) => (current ? { ...current, state } : current));
      if (state.hasGuessedCorrectly) {
        setHasGuessedCorrectly(true);
        setGuessedName(state.guessedName ?? "");
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!session?.state.completed) return;
    playSound("fanfare");
    const timer = window.setTimeout(() => router.push(`/play/${sessionId}/climax`), 1200);
    return () => window.clearTimeout(timer);
  }, [router, session?.state.completed, sessionId]);

  const getHomePosition = useCallback((): Point => {
    const stage = stageRef.current;
    return { x: 0, y: stage ? Math.max(12, stage.getBoundingClientRect().height - 124) : 0 };
  }, []);

  const getCellPosition = useCallback((cellId: string): Point | null => {
    const stage = stageRef.current;
    const cell = cellRefs.current[cellId];
    if (!stage || !cell) return null;
    const stageRect = stage.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    return {
      x: cellRect.left - stageRect.left + cellRect.width / 2 - 36 + 76,
      y: cellRect.top - stageRect.top + cellRect.height / 2 - 102 + 18,
    };
  }, []);

  const activeSessionId = session?.config.sessionId;
  const activeGridRows = session?.config.gridRows;
  const activeGridCols = session?.config.gridCols;

  useEffect(() => {
    if (!activeSessionId) return;
    const frame = window.requestAnimationFrame(() => setPosition(getHomePosition()));
    return () => window.cancelAnimationFrame(frame);
  }, [activeGridCols, activeGridRows, activeSessionId, getHomePosition]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => {
      const next = activeCell ? getCellPosition(activeCell) : getHomePosition();
      if (next) setPosition(next);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [activeCell, getCellPosition, getHomePosition]);

  const moveToCell = useCallback(
    async (cellId: string) => {
      const target = getCellPosition(cellId);
      if (!target) return;
      const distance = Math.hypot(target.x - position.x, target.y - position.y);
      const travelTime = Math.min(1700, Math.max(700, distance * 1.8));
      setDirection(target.x >= position.x ? "right" : "left");
      setDuration(travelTime);
      setActiveCell(cellId);
      setPhase("running");
      playSound("steps");
      setPosition(target);
      await delay(travelTime + 60);
    },
    [getCellPosition, position.x, position.y]
  );

  const resetBuilder = async () => {
    const home = getHomePosition();
    setDirection(home.x >= position.x ? "right" : "left");
    setDuration(850);
    setActiveCell(null);
    setPhase("running");
    setPosition(home);
    await delay(900);
    setPhase("idle");
  };

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Fireworks canvas effect
  const fireworksRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!showFireworks) return;
    const canvas = fireworksRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
    const colors = ["#f2c551", "#b91f2e", "#6fd19a", "#fff", "#f97316", "#8b5cf6", "#06b6d4"];
    const particles: Particle[] = [];
    for (let burst = 0; burst < 8; burst++) {
      const bx = Math.random() * canvas.width;
      const by = Math.random() * canvas.height * 0.6;
      const color = colors[Math.floor(Math.random() * colors.length)];
      for (let p = 0; p < 40; p++) {
        const angle = (Math.PI * 2 * p) / 40;
        const speed = 2 + Math.random() * 5;
        particles.push({ x: bx, y: by, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2, life: 1, color, size: 3 + Math.random() * 3 });
      }
    }
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.life -= 0.013;
        if (p.life <= 0) continue;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (particles.some((p) => p.life > 0)) { raf = requestAnimationFrame(draw); }
      else { setShowFireworks(false); }
    };
    raf = requestAnimationFrame(draw);
    const timeout = window.setTimeout(() => setShowFireworks(false), 5000);
    return () => { cancelAnimationFrame(raf); clearTimeout(timeout); };
  }, [showFireworks]);

  // Quản lý Audio nhạc nền
  useEffect(() => {
    if (!musicUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
    }
    const audio = audioRef.current;
    audio.src = musicUrl;
    audio.volume = volume;
    audio.muted = isMuted;
    if (isPlaying) void audio.play().catch(() => {/* autoplay policy */});
    return () => { audio.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicUrl]);

  useEffect(() => {
    if (!audioRef.current || !musicUrl) return;
    audioRef.current.volume = volume;
  }, [volume, musicUrl]);

  useEffect(() => {
    if (!audioRef.current || !musicUrl) return;
    audioRef.current.muted = isMuted;
  }, [isMuted, musicUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !musicUrl) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else { void audio.play().catch(() => {}); setIsPlaying(true); }
  };

  const applyMusic = async (url: string) => {
    if (!url.trim()) return;
    const finalUrl = url.trim();
    setMusicUrl(finalUrl);
    setMusicInput(finalUrl);
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = finalUrl;
    audioRef.current.loop = true;
    audioRef.current.volume = volume;
    audioRef.current.muted = isMuted;
    void audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    // Persist music URL
    if (session) {
      const nextState: GameState = { ...session.state, bgMusicUrl: finalUrl, updatedAt: new Date().toISOString() };
      setSession({ ...session, state: nextState });
      try { await saveGameState(nextState); } catch { /* nonfatal */ }
    }
    setMusicOpen(false);
  };

  const handleMusicFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    void applyMusic(url);
  };

  const handleResetGame = async () => {
    if (!session) return;
    setIsResetting(true);
    try {
      const resetState = await resetGameState(session);
      setSession({ ...session, state: resetState });
      setResetConfirmOpen(false);
      setResult({
        kind: "success",
        title: "Đã làm mới trận chơi!",
        body: "Toàn bộ các ô thi công đã được đưa về trạng thái ban đầu.",
      });
    } finally {
      setIsResetting(false);
    }
  };

  // Xác định ô gợi ý tiếp theo
  const suggestedTargetIndex = useMemo(() => {
    if (!session) return -1;
    return session.state.gridStatus.findIndex((cell) => cell.status !== "built");
  }, [session]);

  // Xử lý khi người chơi bấm trực tiếp vào một ô bất kỳ trên lưới
  const handleCellClick = async (clickedIndex: number) => {
    if (!session || isSaving || session.state.completed) return;
    const { state, config } = session;
    const targetCell = state.gridStatus[clickedIndex];
    if (!targetCell) return;

    // 1. Ô đã hoàn thành
    if (targetCell.status === "built") {
      await moveToCell(targetCell.cellId);
      setPhase("idle");
      setResult({
        kind: "success",
        title: "Mảnh ghép đã hoàn thành!",
        body: `Mảnh ghép số ${clickedIndex + 1} này đã được lật mở. Hãy tiếp tục chọn các ô còn lại để hoàn thiện toàn bộ bức tranh!`,
      });
      return;
    }

    // 2. Ô chưa thi công hoặc cần sửa lại -> Kỹ sư di chuyển tới
    setSelectedTargetIndex(clickedIndex);
    await moveToCell(targetCell.cellId);
    setPhase("idle");

    // Lấy câu hỏi tương ứng cho ô này từ ngân hàng câu hỏi
    const allMainQuestions = config.stagesData.flatMap((s) => s.questions).filter((q) => !q.isBackup);
    const allBackupQuestions = config.stagesData.flatMap((s) => s.questions).filter((q) => q.isBackup);

    let q: Question;
    if (targetCell.status === "failed" && allBackupQuestions.length > 0) {
      q = allBackupQuestions[clickedIndex % allBackupQuestions.length];
    } else if (allMainQuestions.length > 0) {
      q = allMainQuestions[clickedIndex % allMainQuestions.length];
    } else {
      q = config.stagesData[0]?.questions[0] || {
        id: "default-q",
        type: "mcq",
        question: "Đảng Cộng sản Việt Nam được thành lập vào ngày tháng năm nào?",
        options: ["03/02/1930", "19/08/1945", "02/09/1945", "30/04/1975"],
        answer: "03/02/1930",
      };
    }

    setSelectedQuestion(q);
    setAnswer("");
    setQuizState("answering");
    setIsCorrectResult(null);
    setQuestionOpen(true);
  };

  const triggerNextQuestion = () => {
    if (suggestedTargetIndex >= 0) {
      void handleCellClick(suggestedTargetIndex);
    }
  };

  // Bước 1: Kiểm tra đáp án và hiển thị trực quan ngay trên modal câu hỏi (màu xanh lá chỗ đúng, màu đỏ chỗ sai)
  const checkAnswer = () => {
    if (!selectedQuestion || !answer.trim()) return;
    const correct = normalize(answer) === normalize(selectedQuestion.answer);
    setQuizState("submitted");
    setIsCorrectResult(correct);
    if (correct) {
      playSound("success");
    } else {
      playSound("crack");
    }
  };

  // Bước 2: Người xem đã nhìn rõ đáp án đúng, bấm tiếp tục để kỹ sư chạy tới thi công mở ô
  const proceedAfterQuiz = async () => {
    if (
      !session ||
      !selectedQuestion ||
      selectedTargetIndex === null ||
      selectedTargetIndex < 0 ||
      !selectedMemberId
    )
      return;

    const member = session.members.find((item) => item.id === selectedMemberId) ?? session.members[0];
    const correct = Boolean(isCorrectResult);
    const target = session.state.gridStatus[selectedTargetIndex];

    setActiveMember(member);
    setQuestionOpen(false);
    setIsSaving(true);

    await moveToCell(target.cellId);
    setPhase("hammering");
    playSound("hammer");
    await delay(1450);

    const nextGrid = session.state.gridStatus.map((cell, index) =>
      index === selectedTargetIndex
        ? {
            ...cell,
            status: correct ? ("built" as const) : ("failed" as const),
            builtBy: correct ? member?.id ?? null : null,
          }
        : cell
    );

    const completed = correct && nextGrid.every((cell) => cell.status === "built");

    const nextState: GameState = {
      ...session.state,
      gridStatus: nextGrid,
      completed,
      updatedAt: new Date().toISOString(),
    };

    setSession({ ...session, state: nextState });
    try {
      await saveGameState(nextState);
    } catch {
      /* Local state remains usable. */
    }

    if (correct) {
      setPhase("celebrating");
      playSound("success");
    } else {
      setPhase("sad");
      playSound("crack");
    }

    await delay(900);
    setPhase("idle");
    setIsSaving(false);
    setAnswer("");
    setSelectedTargetIndex(null);
    setSelectedQuestion(null);
    setQuizState("answering");
    setIsCorrectResult(null);
  };

  // Cơ chế Đoán Bức tranh bí mật riêng biệt (thông báo đúng/sai và vẫn cho chơi tiếp bình thường)
  const handleGuessPicture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !guessInput.trim()) return;
    const targetName = session.config.buildingName;
    const normInput = normalize(guessInput);
    const normTarget = normalize(targetName);
    const isMatch =
      normInput === normTarget ||
      normTarget.includes(normInput) ||
      normInput.includes(normTarget);

    if (isMatch) {
      playSound("fanfare");
      setHasGuessedCorrectly(true);
      setGuessedName(targetName);
      setShowFireworks(true);
      setGuessFeedback({
        kind: "success",
        message: `🎉 CHÍNH XÁC! Bạn đã đoán đúng bức tranh bí mật: "${targetName}"! Bạn có thể tiếp tục lật mở các ô còn lại để hoàn thành 100% công trình!`,
      });
      // Persist to GameState
      const nextState: GameState = {
        ...session.state,
        hasGuessedCorrectly: true,
        guessedName: targetName,
        updatedAt: new Date().toISOString(),
      };
      setSession({ ...session, state: nextState });
      try { await saveGameState(nextState); } catch { /* nonfatal */ }
    } else {
      playSound("crack");
      setGuessFeedback({
        kind: "error",
        message: `Chưa chính xác rồi! Hãy tiếp tục mở thêm các ô câu hỏi để thấy rõ hơn các chi tiết của bức tranh nhé!`,
      });
    }
  };

  if (loadError)
    return (
      <main className="loading-screen">
        <Construction />
        <h1>Không tải được phòng</h1>
        <p>{loadError}</p>
      </main>
    );

  if (!session)
    return (
      <main className="loading-screen">
        <span className="loader" />
        <p>Đang tải công trường từ Supabase…</p>
      </main>
    );

  const { config, members, state } = session;
  const totalBuilt = state.gridStatus.filter((cell) => cell.status === "built").length;
  const progress = Math.round((totalBuilt / state.gridStatus.length) * 100);
  const initials = (activeMember?.name ?? "Kỹ sư")
    .split(" ")
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <main className="app-shell">
      {/* Fireworks canvas overlay */}
      {showFireworks && (
        <canvas
          ref={fireworksRef}
          style={{
            position: "fixed", inset: 0, width: "100%", height: "100%",
            pointerEvents: "none", zIndex: 9999,
          }}
        />
      )}

      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          <Hammer size={21} strokeWidth={2.6} />
        </div>
        <div className="brand-copy">
          <p>XÂY NGÔI NHÀ ĐẢNG VỮNG MẠNH</p>
          <span>Phòng: {config.sessionName}</span>
        </div>
        <div className="header-actions">
          {/* Music mini-player */}
          <div className="music-player-bar">
            <button
              className="music-btn"
              title={musicUrl ? (isPlaying ? "Tạm dừng nhạc" : "Phát nhạc") : "Chưa có nhạc"}
              onClick={togglePlay}
              disabled={!musicUrl}
              aria-label="Phát/Tạm dừng nhạc nền"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              className="music-btn"
              title={isMuted ? "Bật tiếng" : "Tắt tiếng"}
              onClick={() => setIsMuted((m) => !m)}
              disabled={!musicUrl}
              aria-label="Tắt/Bật tiếng"
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range" min={0} max={1} step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="music-volume"
              aria-label="Âm lượng nhạc nền"
              title={`Âm lượng: ${Math.round(volume * 100)}%`}
              disabled={!musicUrl}
            />
            <button
              className="music-btn music-settings-btn"
              title="Cài đặt nhạc nền"
              onClick={() => { setMusicInput(musicUrl); setMusicOpen(true); }}
              aria-label="Cài đặt nhạc nền"
            >
              <Music size={14} />
            </button>
          </div>
          <Button
            variant="outline"
            className="reset-topbar-btn"
            title="Làm mới trận chơi từ đầu"
            onClick={() => setResetConfirmOpen(true)}
          >
            <RotateCcw size={14} />
            <span>Làm mới trận</span>
          </Button>
          <Link href="/" className="exit-home-btn" title="Thoát ra màn hình chính">
            <Home size={15} />
            <span>Thoát ra trang chủ</span>
          </Link>
          <span className="session-pill">
            <span /> {isSupabaseConfigured() ? "Supabase Cloud Realtime" : "Local Realtime"}
          </span>
          <Link href={`/admin?session=${config.sessionId}`} className="admin-link">
            <Settings size={15} /> Quản trị
          </Link>
        </div>
      </header>

      <section className="workspace">
        <div className="construction-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">BỨC TRANH LỊCH SỬ BÍ MẬT · CHỌN Ô ĐỂ THI CÔNG & LẬT MỞ</p>
              <h1>Lật mở bức tranh: {config.buildingName}</h1>
            </div>
            <div className="stage-chip">
              <span>{progress}%</span> Hoàn thiện ({totalBuilt}/{state.gridStatus.length} ô)
            </div>
          </div>

          <div className={`site-frame ${state.completed ? "is-complete" : ""}`} ref={stageRef}>
            <div className="site-sky" aria-hidden="true">
              <span className="sun" />
              <span className="cloud cloud-one" />
              <span className="cloud cloud-two" />
            </div>
            <div className="crane" aria-hidden="true">
              <span className="crane-mast" />
              <span className="crane-arm" />
              <span className="crane-cable" />
              <span className="crane-hook" />
            </div>
            <div className="scaffold scaffold-left" aria-hidden="true" />
            <div className="scaffold scaffold-right" aria-hidden="true" />

            <div
              className="build-grid"
              role="grid"
              aria-label={`Lưới công trình ${config.gridRows} hàng ${config.gridCols} cột`}
              style={{
                gridTemplateColumns: `repeat(${config.gridCols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${config.gridRows}, minmax(0, 1fr))`,
              }}
            >
              {state.gridStatus.map((cell, index) => {
                const row = Math.floor(index / config.gridCols);
                const col = index % config.gridCols;
                const isBuilt = cell.status === "built";
                const isFailed = cell.status === "failed";
                const isTarget = index === suggestedTargetIndex;

                const backgroundPosition = `${
                  config.gridCols === 1 ? 0 : (col / (config.gridCols - 1)) * 100
                }% ${config.gridRows === 1 ? 0 : (row / (config.gridRows - 1)) * 100}%`;

                return (
                  <button
                    key={cell.cellId}
                    ref={(node) => {
                      cellRefs.current[cell.cellId] = node;
                    }}
                    className="grid-cell"
                    data-status={cell.status}
                    data-target={isTarget}
                    data-stage-active={!isBuilt}
                    role="gridcell"
                    title={`Mảnh ghép số ${index + 1} (${isBuilt ? "Đã hoàn thành" : "Nhấn để thi công"})`}
                    onClick={() => void handleCellClick(index)}
                    style={
                      isBuilt
                        ? {
                            backgroundImage: `url("${config.buildingImageUrl}")`,
                            backgroundSize: `${config.gridCols * 100}% ${config.gridRows * 100}%`,
                            backgroundPosition,
                          }
                        : undefined
                    }
                  >
                    <span className="cell-index">{String(index + 1).padStart(2, "0")}</span>
                    {!isBuilt && <span className="cell-cross" aria-hidden="true" />}
                    {isFailed && <span className="crack-overlay" aria-hidden="true">✕</span>}
                    {isTarget && !isBuilt && <span className="target-pulse" aria-hidden="true" />}
                    {isBuilt && (
                      <span className="built-check">
                        <Check size={13} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div
              className="builder-sprite"
              data-phase={phase}
              data-direction={direction}
              style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
                transitionDuration: `${duration}ms`,
              }}
              aria-label={`Nhân vật kỹ sư ${activeMember?.name ?? ""}`}
            >
              <span className="builder-shadow" />
              <span className="builder-character">
                <span className="hard-hat" />
                <span
                  className="builder-head"
                  style={
                    activeMember?.avatarUrl
                      ? { backgroundImage: `url("${activeMember.avatarUrl}")` }
                      : undefined
                  }
                >
                  {activeMember?.avatarUrl ? "" : initials}
                </span>
                <span className="builder-body">
                  <span className="vest-line" />
                </span>
                <span className="builder-arm builder-arm-left" />
                <span className="builder-arm builder-arm-right">
                  <Hammer size={19} />
                </span>
                <span className="builder-leg builder-leg-left" />
                <span className="builder-leg builder-leg-right" />
                {phase === "sad" && <span className="tear">●</span>}
                {phase === "celebrating" && <span className="celebrate-star">★</span>}
              </span>
            </div>

            <div className="ground-strip" aria-hidden="true" />
            <div className="site-instruction">
              <Sparkles size={16} />{" "}
              {isSaving
                ? phase === "hammering"
                  ? "Đang thi công gõ búa…"
                  : "Kỹ sư đang di chuyển…"
                : "👉 Nhấp trực tiếp vào bất kỳ ô nào chưa mở để trả lời câu hỏi và lật mở mảnh ghép!"}
            </div>
          </div>

          <div className="legend-row">
            <span>
              <i className="legend-empty" /> Chưa mở
            </span>
            <span>
              <i className="legend-built" /> Đã lật mở
            </span>
            <span>
              <i className="legend-failed" /> Cần sửa (câu dự bị)
            </span>
            <span className="coordinate-readout" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {hasGuessedCorrectly ? (
                <b style={{ color: "#166534", background: "#dcfce7", padding: "3px 8px", borderRadius: 6 }}>
                  ⭐ ĐÃ ĐOÁN ĐÚNG BỨC TRANH!
                </b>
              ) : (
                <>Đang mở: <b>{totalBuilt}/{state.gridStatus.length} mảnh ghép</b></>
              )}
            </span>
          </div>
        </div>

        <aside className="control-panel">
          <div className="progress-card">
            <div className="progress-title">
              <div>
                <p>TIẾN ĐỘ BỨC TRANH</p>
                <strong>
                  {totalBuilt}/{state.gridStatus.length} mảnh ghép
                </strong>
              </div>
              <div className="progress-number">{progress}%</div>
            </div>
            <div className="progress-track">
              <span style={{ width: `${progress}%` }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: "0.78rem", color: "#64736e" }}>
              <span>Đã hoàn thành: <b>{totalBuilt}</b></span>
              <span>Chưa mở: <b>{state.gridStatus.length - totalBuilt}</b></span>
            </div>
          </div>

          <div className="team-card">
            <div className="card-label">
              <span>
                <Users size={16} /> KỸ SƯ THI CÔNG
              </span>
              <b>Chỉ huy</b>
            </div>
            <div className="single-engineer-panel">
              <div
                className="engineer-avatar-lg"
                style={{
                  backgroundImage: activeMember?.avatarUrl ? `url("${activeMember.avatarUrl}")` : undefined,
                  backgroundColor: activeMember?.color || "#b91f2e",
                }}
              >
                {!activeMember?.avatarUrl && initials}
              </div>
              <div className="engineer-meta-lg">
                <strong>{activeMember?.name || "Kỹ sư trưởng"}</strong>
                <span>Chỉ huy thi công công trường</span>
              </div>
            </div>
          </div>

          <div className="action-stack">
            <Button
              className="primary-action"
              onClick={triggerNextQuestion}
              disabled={isSaving || state.completed || suggestedTargetIndex < 0}
            >
              Ô tiếp theo <ArrowRight size={17} />
            </Button>
            <Button
              className="guess-action"
              style={{
                background: hasGuessedCorrectly ? "#166534" : "#b45309",
                color: "#fff",
                fontWeight: 750,
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
              onClick={() => {
                setGuessFeedback(null);
                setGuessInput("");
                setGuessPictureOpen(true);
              }}
              disabled={isSaving}
            >
              <Sparkles size={16} /> {hasGuessedCorrectly ? "⭐ Đã đoán đúng bức tranh!" : "Đoán bức tranh bí mật"}
            </Button>
            <Button
              className="reset-action"
              variant="ghost"
              onClick={() => void resetBuilder()}
              disabled={isSaving || !activeCell}
            >
              <RotateCcw size={15} /> Đưa kỹ sư về vị trí đầu
            </Button>
          </div>

          <div className="phase-note">
            <span>QUY TẮC THI CÔNG</span>
            <p>
              Chọn bất kỳ ô nào chưa mở để trả lời câu hỏi và hé lộ từng mảnh ghép. Nếu bạn đã nhận ra bức tranh lịch sử bí mật phía sau, hãy bấm nút <b>Đoán bức tranh bí mật</b> để thử tài nhé!
            </p>
          </div>
        </aside>
      </section>

      {/* Dialog trả lời câu hỏi với phản hồi trực quan màu xanh/đỏ */}
      <Dialog open={questionOpen} onOpenChange={(open) => !isSaving && quizState === "answering" && setQuestionOpen(open)}>
        <DialogContent className="game-dialog sm:max-w-2xl">
          <DialogHeader>
            <span className="dialog-kicker">
              MẢNH GHÉP SỐ {selectedTargetIndex !== null ? selectedTargetIndex + 1 : ""} · {selectedQuestion?.isBackup ? "CÂU HỎI DỰ BỊ" : "CÂU HỎI CHÍNH"}
            </span>
            <DialogTitle>{selectedQuestion?.question}</DialogTitle>
            <DialogDescription>
              {quizState === "answering"
                ? "Chọn đáp án chính xác để kỹ sư tiến hành đặt mảnh ghép vào công trình."
                : isCorrectResult
                ? "🎉 Chúc mừng bạn đã chọn chính xác!"
                : "❌ Bạn đã chọn chưa chính xác! Hãy quan sát vị trí đáp án đúng màu xanh lá bên dưới."}
            </DialogDescription>
          </DialogHeader>

          {selectedQuestion?.type === "mcq" ? (
            <div className="answer-options">
              {selectedQuestion.options.map((option, index) => {
                const isSelected = answer === option;
                const isOptionCorrect = normalize(option) === normalize(selectedQuestion.answer);

                let extraClass = "";
                if (quizState === "submitted") {
                  if (isOptionCorrect) {
                    extraClass = "is-correct";
                  } else if (isSelected && !isOptionCorrect) {
                    extraClass = "is-wrong";
                  } else {
                    extraClass = "is-dimmed";
                  }
                }

                return (
                  <button
                    key={option}
                    data-active={isSelected}
                    className={extraClass}
                    disabled={quizState === "submitted"}
                    onClick={() => setAnswer(option)}
                  >
                    <span>{String.fromCharCode(65 + index)}</span>
                    <span style={{ flex: 1 }}>{option}</span>
                    {quizState === "submitted" && isOptionCorrect && (
                      <Check size={18} style={{ color: "#16a34a", flexShrink: 0 }} />
                    )}
                    {quizState === "submitted" && isSelected && !isOptionCorrect && (
                      <X size={18} style={{ color: "#dc2626", flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="crossword-answer">
              <span>ĐÁP ÁN Ô CHỮ</span>
              <input
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Nhập câu trả lời…"
                disabled={quizState === "submitted"}
                style={
                  quizState === "submitted"
                    ? {
                        borderColor: isCorrectResult ? "#16a34a" : "#dc2626",
                        background: isCorrectResult ? "#f0fdf4" : "#fef2f2",
                      }
                    : undefined
                }
                autoFocus
              />
            </div>
          )}

          {/* Banner giải thích trực quan khi đã submit */}
          {quizState === "submitted" && (
            <div className={`quiz-feedback-banner ${isCorrectResult ? "is-correct" : "is-wrong"}`}>
              {isCorrectResult ? (
                <Check size={22} style={{ flexShrink: 0, marginTop: 2 }} />
              ) : (
                <X size={22} style={{ flexShrink: 0, marginTop: 2 }} />
              )}
              <div>
                <strong>{isCorrectResult ? "CHÍNH XÁC! HOAN HÔ!" : "RẤT TIẾC, CHƯA CHÍNH XÁC!"}</strong>
                <span>
                  {isCorrectResult
                    ? `Đáp án đúng là: "${selectedQuestion?.answer}". Kỹ sư sẽ tiến hành gắn mảnh ghép này!`
                    : `Đáp án chính xác là: "${selectedQuestion?.answer}" (vừa được làm nổi bật màu xanh lá phía trên). Ô này sẽ dùng câu hỏi dự bị cho lượt thi công tiếp theo!`}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            {quizState === "answering" ? (
              <>
                <Button variant="ghost" onClick={() => setQuestionOpen(false)}>
                  Để sau
                </Button>
                <Button
                  onClick={checkAnswer}
                  disabled={!answer.trim()}
                  style={{ background: "#b91f2e", color: "#fff", fontWeight: 700 }}
                >
                  <Hammer size={16} /> Chốt đáp án
                </Button>
              </>
            ) : (
              <Button
                onClick={() => void proceedAfterQuiz()}
                style={{
                  background: isCorrectResult ? "#16a34a" : "#b91f2e",
                  color: "#fff",
                  fontWeight: 700,
                  width: "100%",
                }}
              >
                <Hammer size={16} /> Tiếp tục thi công <ArrowRight size={16} />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Đoán Bức Tranh Bí Mật riêng biệt (không kết thúc ván chơi) */}
      <Dialog open={guessPictureOpen} onOpenChange={setGuessPictureOpen}>
        <DialogContent className="game-dialog sm:max-w-md">
          <DialogHeader>
            <span className="dialog-kicker" style={{ color: hasGuessedCorrectly ? "#166534" : "#d97706" }}>
              {hasGuessedCorrectly ? "🏆 ĐÃ ĐOÁN ĐÚNG BỨC TRANH!" : "ĐOÁN BỨC TRANH BÍ MẬT"}
            </span>
            <DialogTitle>
              {hasGuessedCorrectly ? `"${guessedName}"` : "Bạn đã nhận ra bức tranh?"}
            </DialogTitle>
            <DialogDescription>
              {hasGuessedCorrectly
                ? "Chúc mừng! Bạn đã đoán chính xác bức tranh bí mật trong phiên chơi này. Hãy tiếp tục mở các ô còn lại để hoàn thiện 100% công trình!"
                : "Nếu bạn đã đoán ra tên công trình hoặc sự kiện lịch sử ẩn giấu sau các mảnh ghép, hãy nhập dự đoán bên dưới!"}
            </DialogDescription>
          </DialogHeader>

          {hasGuessedCorrectly ? (
            <div
              className="quiz-feedback-banner is-correct"
              style={{ fontSize: "1rem", padding: "16px 20px", gap: 14 }}
            >
              <Sparkles size={28} style={{ flexShrink: 0, color: "#f2c551" }} />
              <div>
                <strong style={{ fontSize: "1.05rem" }}>CHÍNH XÁC TUYỆT VỜI!</strong>
                <span style={{ display: "block", marginTop: 4 }}>
                  Bức tranh bí mật là: <b style={{ color: "#166534" }}>&ldquo;{guessedName}&rdquo;</b>.
                  Kết quả này đã được lưu lại và sẽ giữ nguyên nếu bạn tiếp tục phiên chơi.
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => { void handleGuessPicture(e); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64736e" }}>
                  Tên bức tranh / công trình / sự kiện:
                </span>
                <input
                  type="text"
                  required
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  placeholder="Ví dụ: Ngôi Nhà Đảng Vững Mạnh…"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #d9cdb4",
                    background: "#faf7ef",
                    color: "#173b32",
                    fontSize: "0.95rem",
                    outline: "none",
                  }}
                  autoFocus
                />
              </label>

              {guessFeedback && (
                <div
                  className={`quiz-feedback-banner ${guessFeedback.kind === "success" ? "is-correct" : "is-wrong"}`}
                  style={{ marginTop: 0 }}
                >
                  {guessFeedback.kind === "success" ? (
                    <Check size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : (
                    <X size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                  )}
                  <div>{guessFeedback.message}</div>
                </div>
              )}

              <DialogFooter style={{ marginTop: 8 }}>
                <Button type="button" variant="outline" onClick={() => setGuessPictureOpen(false)}>
                  Để sau
                </Button>
                <Button
                  type="submit"
                  disabled={!guessInput.trim()}
                  style={{ background: "#b45309", color: "#fff", fontWeight: 700 }}
                >
                  <Sparkles size={15} /> Xác nhận đoán
                </Button>
              </DialogFooter>
            </form>
          )}

          {hasGuessedCorrectly && (
            <DialogFooter style={{ marginTop: 16 }}>
              <Button
                onClick={() => setGuessPictureOpen(false)}
                style={{ background: "#166534", color: "#fff", fontWeight: 700, width: "100%" }}
              >
                <Check size={16} /> Đóng &amp; Tiếp tục chơi
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog kết quả chung nếu có */}
      <Dialog open={Boolean(result)} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className={`result-dialog ${result?.kind ?? ""}`}>
          <div className="result-icon">
            {result?.kind === "success" ? <Trophy /> : <Construction />}
          </div>
          <DialogHeader>
            <DialogTitle>{result?.title}</DialogTitle>
            <DialogDescription>{result?.body}</DialogDescription>
          </DialogHeader>
          <Button onClick={() => setResult(null)}>Tiếp tục</Button>
        </DialogContent>
      </Dialog>

      {/* Dialog cài đặt nhạc nền */}
      <Dialog open={musicOpen} onOpenChange={setMusicOpen}>
        <DialogContent className="game-dialog" style={{ maxWidth: 480 }}>
          <DialogHeader>
            <span className="dialog-kicker" style={{ color: "#4f46e5" }}>NHẠC NỀN TRÒ CHƠI</span>
            <DialogTitle>Cài đặt nhạc nền</DialogTitle>
            <DialogDescription>
              Nhập đường dẫn URL bài nhạc (MP3/OGG…) hoặc tải file nhạc từ máy tính lên.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64736e" }}>URL bài nhạc:</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="url"
                  value={musicInput}
                  onChange={(e) => setMusicInput(e.target.value)}
                  placeholder="https://example.com/music.mp3"
                  style={{
                    flex: 1, padding: "9px 12px", borderRadius: 10,
                    border: "1px solid #d9cdb4", background: "#faf7ef",
                    color: "#173b32", fontSize: "0.9rem", outline: "none",
                  }}
                  autoFocus
                />
                <Button
                  type="button"
                  disabled={!musicInput.trim()}
                  onClick={() => void applyMusic(musicInput)}
                  style={{ background: "#4f46e5", color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}
                >
                  <Play size={15} /> Áp dụng
                </Button>
              </div>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: "#e2d9c5" }} />
              <span style={{ fontSize: "0.74rem", color: "#9ca3af", fontWeight: 600 }}>HOẶC</span>
              <div style={{ flex: 1, height: 1, background: "#e2d9c5" }} />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => musicFileRef.current?.click()}
              style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}
            >
              <Upload size={16} /> Tải file nhạc từ máy tính…
            </Button>
            <input
              ref={musicFileRef}
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={handleMusicFileChange}
            />
            {musicUrl && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10 }}>
                <Music2 size={18} style={{ color: "#16a34a", flexShrink: 0 }} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#166534", display: "block" }}>ĐANG DÙNG NHẠC</span>
                  <span style={{ fontSize: "0.8rem", color: "#064e3b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{musicUrl.startsWith("blob:") ? "File nhạc từ máy tính" : musicUrl}</span>
                </div>
                <Button
                  type="button" variant="ghost" style={{ color: "#dc2626", padding: "4px 8px", minWidth: 0 }}
                  onClick={() => {
                    audioRef.current?.pause();
                    setMusicUrl("");
                    setMusicInput("");
                    setIsPlaying(false);
                  }}
                  title="Xóa nhạc nền"
                >
                  <X size={15} />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog xác nhận làm mới ván chơi */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="room-choice-dialog" style={{ maxWidth: 440 }}>
          <DialogHeader>
            <span className="dialog-kicker" style={{ color: "#d97706" }}>LÀM MỚI TRẬN ĐẤU</span>
            <DialogTitle>Đặt lại ván chơi từ đầu?</DialogTitle>
            <DialogDescription>
              Toàn bộ các ô đã mở sẽ được đưa về trạng thái ban đầu để bạn bắt đầu một buổi thi công mới toanh.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <Button variant="outline" onClick={() => setResetConfirmOpen(false)}>
              Hủy
            </Button>
            <Button
              disabled={isResetting}
              style={{ background: "#d97706", color: "#fff" }}
              onClick={() => void handleResetGame()}
            >
              {isResetting ? "Đang đặt lại…" : "Xác nhận làm mới"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

