"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  Eye,
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
import { DEFAULT_BG_MUSIC_URL, cellStage } from "@/lib/mock-game";
import { applyMusicToAllRooms, isSupabaseConfigured, loadSession, resetGameState, saveGameState, subscribeToGameState, uploadAsset } from "@/lib/game-service";
import type { GameSession, GameState, GridCellStatus, Question, TeamMember } from "@/lib/game-types";
import { canEnterFinale, isBoardExhausted } from "@/lib/game-types";
import { normalizeAnswerText, parseMultiSelectAnswers, getMainQuestions, getBackupsForParent, pickUnusedBackup } from "@/lib/question-answers";

type Point = { x: number; y: number };
type BuilderPhase = "idle" | "running" | "hammering" | "celebrating" | "sad";
type ResultMessage = { kind: "success" | "error"; title: string; body: string } | null;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value: unknown) => normalizeAnswerText(value);

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
      // Tăng âm lượng hiệu ứng lên 0.5 để nổi bật hơn hẳn nhạc nền
      gain.gain.exponentialRampToValueAtTime(0.5, context.currentTime + index * 0.14 + 0.015);
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
  const [selectedMultiAnswers, setSelectedMultiAnswers] = useState<string[]>([]);
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
  const [peekingAtBoard, setPeekingAtBoard] = useState(false);
  const peekingAtBoardRef = useRef(false);

  // Nhạc nền (mặc định âm lượng 0.2 để luôn êm ái ở dưới nền)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicInput, setMusicInput] = useState("");
  const [musicOpen, setMusicOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.2);
  const [isUploadingMusic, setIsUploadingMusic] = useState(false);
  const [isApplyingAllMusic, setIsApplyingAllMusic] = useState(false);
  const musicFileRef = useRef<HTMLInputElement | null>(null);
  // Track whether user has interacted (for autoplay policy unlock)
  const hasInteractedRef = useRef(false);
  const pendingAutoPlayRef = useRef(false);

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
        setHasGuessedCorrectly(Boolean(loaded.state.hasGuessedCorrectly));
        setGuessedName(loaded.state.guessedName ?? "");

        // Restore persisted music URL, fallback to config or default
        const initialMusic = loaded.state.bgMusicUrl || loaded.config.bgMusicUrl || DEFAULT_BG_MUSIC_URL;
        if (initialMusic) {
          setMusicUrl(initialMusic);
          setMusicInput(initialMusic);
        }
      })
      .catch((error) =>
        setLoadError(error instanceof Error ? error.message : "Không thể tải phiên chơi")
      );
    const unsubscribe = subscribeToGameState(sessionId, (state) => {
      setSession((current) => (current ? { ...current, state } : current));
      setHasGuessedCorrectly(Boolean(state.hasGuessedCorrectly));
      setGuessedName(state.guessedName ?? "");
      if (!state.hasGuessedCorrectly) {
        setShowFireworks(false);
      }
      if (state.bgMusicUrl) {
        setMusicUrl(state.bgMusicUrl);
        setMusicInput(state.bgMusicUrl);
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
    const timer = window.setTimeout(() => {
      window.location.href = `/play/${sessionId}/climax`;
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [session?.state.completed, sessionId]);

  useEffect(() => {
    if (!session || session.state.completed || isSaving || questionOpen || peekingAtBoard) return;
    if (isBoardExhausted(session.state.gridStatus) && !hasGuessedCorrectly) {
      setGuessPictureOpen(true);
    }
  }, [session, hasGuessedCorrectly, isSaving, questionOpen, peekingAtBoard]);

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

  // Quản lý Audio nhạc nền: Giới hạn âm lượng BGM tối đa 35% để luôn làm nền êm dịu
  const bgmVolume = Math.min(1, Math.max(0, volume * 0.35));

  // Autoplay: play BGM on first user interaction (click/keydown/touchstart)
  useEffect(() => {
    const tryPlay = () => {
      if (hasInteractedRef.current) return;
      hasInteractedRef.current = true;
      if (pendingAutoPlayRef.current && audioRef.current && musicUrl) {
        void audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        pendingAutoPlayRef.current = false;
      }
    };
    window.addEventListener("click", tryPlay, { once: true });
    window.addEventListener("keydown", tryPlay, { once: true });
    window.addEventListener("touchstart", tryPlay, { once: true });
    return () => {
      window.removeEventListener("click", tryPlay);
      window.removeEventListener("keydown", tryPlay);
      window.removeEventListener("touchstart", tryPlay);
    };
  }, [musicUrl]);

  useEffect(() => {
    if (!musicUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
    }
    const audio = audioRef.current;
    audio.src = musicUrl;
    audio.volume = bgmVolume;
    audio.muted = isMuted;
    // Try auto-play immediately; if blocked, set flag for first interaction
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      void playPromise.then(() => {
        setIsPlaying(true);
        hasInteractedRef.current = true;
      }).catch(() => {
        // Autoplay blocked – will play on first user interaction
        pendingAutoPlayRef.current = true;
      });
    }
    return () => { audio.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicUrl]);

  useEffect(() => {
    if (!audioRef.current || !musicUrl) return;
    audioRef.current.volume = bgmVolume;
  }, [bgmVolume, musicUrl]);

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
    audioRef.current.volume = bgmVolume;
    audioRef.current.muted = isMuted;
    void audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    // Persist music URL vào GameState và cấu hình phòng
    if (session) {
      const nextState: GameState = { ...session.state, bgMusicUrl: finalUrl, updatedAt: new Date().toISOString() };
      setSession({ ...session, state: nextState });
      try { await saveGameState(nextState); } catch { /* nonfatal */ }
    }
    setMusicOpen(false);
  };

  const handleMusicFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setIsUploadingMusic(true);
    try {
      // Tải file trực tiếp lên Supabase Storage bucket game-assets
      const cloudUrl = await uploadAsset(file, session.config.sessionId, "audio");
      void applyMusic(cloudUrl);
    } catch (err) {
      alert("Không thể tải file nhạc lên Supabase: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsUploadingMusic(false);
    }
  };

  const handleApplyMusicToAll = async () => {
    if (!musicUrl) return;
    setIsApplyingAllMusic(true);
    try {
      await applyMusicToAllRooms(musicUrl);
      alert("✅ Đã áp dụng bản nhạc này làm âm thanh dùng chung cho TẤT CẢ các phòng thành công!");
    } catch (err) {
      alert("Không thể áp dụng nhạc cho tất cả phòng: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsApplyingAllMusic(false);
    }
  };

  const handleResetGame = async () => {
    if (!session) return;
    setIsResetting(true);
    try {
      const resetState = await resetGameState(session);
      setSession({ ...session, state: resetState });
      // Reset triệt để toàn bộ local state bao gồm câu đố bức tranh bí mật
      setHasGuessedCorrectly(false);
      setGuessedName("");
      setGuessFeedback(null);
      setShowFireworks(false);
      setActiveCell(null);
      setPosition({ x: 0, y: 0 });
      setPhase("idle");
      setQuizState("answering");
      setIsCorrectResult(null);
      setSelectedMultiAnswers([]);
      setAnswer("");
      setQuestionOpen(false);
      setSymbolicOpen(false);
      setGuessPictureOpen(false);
      setPeekingAtBoard(false);
      peekingAtBoardRef.current = false;
      setResetConfirmOpen(false);
      setResult({
        kind: "success",
        title: "Đã làm mới trận chơi!",
        body: "Toàn bộ các ô thi công và kết quả bức tranh bí mật đã được đưa về trạng thái ban đầu.",
      });
    } finally {
      setIsResetting(false);
    }
  };

  // Xác định ô gợi ý tiếp theo
  const suggestedTargetIndex = useMemo(() => {
    if (!session) return -1;
    return session.state.gridStatus.findIndex((cell) => cell.status === "empty" || cell.status === "failed");
  }, [session]);

  // Xử lý khi người chơi bấm trực tiếp vào một ô bất kỳ trên lưới
  const handleCellClick = async (clickedIndex: number) => {
    if (!session || isSaving || session.state.completed) return;
    if (isBoardExhausted(session.state.gridStatus) && !session.state.hasGuessedCorrectly) {
      peekingAtBoardRef.current = false;
      setPeekingAtBoard(false);
      setGuessFeedback(null);
      setGuessInput("");
      setGuessPictureOpen(true);
      return;
    }
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

    // 2. Ô đã khóa hết câu phụ
    if (targetCell.status === "locked") {
      await moveToCell(targetCell.cellId);
      setPhase("idle");
      setResult({
        kind: "error",
        title: "Ô này đã bị khóa!",
        body: "Bạn đã hết câu hỏi phụ cho mảnh ghép này nên không thể mở lại. Hãy thi công các ô còn lại.",
      });
      return;
    }

    // 3. Ô chưa thi công hoặc cần sửa lại -> Kỹ sư di chuyển tới
    setSelectedTargetIndex(clickedIndex);
    await moveToCell(targetCell.cellId);
    setPhase("idle");

    const allQuestions = config.stagesData.flatMap((s) => s.questions);
    const allMainQuestions = getMainQuestions(allQuestions);
    const mainQuestion = allMainQuestions[clickedIndex] ?? allMainQuestions[clickedIndex % Math.max(1, allMainQuestions.length)];

    let q: Question | null = null;
    if (targetCell.status === "failed" && mainQuestion) {
      const backups = getBackupsForParent(allQuestions, mainQuestion.id);
      const usedIds = targetCell.usedBackupIds ?? [];
      q = pickUnusedBackup(backups, usedIds);
      if (!q) {
        const nextGrid = state.gridStatus.map((cell, index) =>
          index === clickedIndex ? { ...cell, status: "locked" as const } : cell
        );
        const nextState: GameState = {
          ...state,
          gridStatus: nextGrid,
          completed: canEnterFinale({ ...state, gridStatus: nextGrid }),
          updatedAt: new Date().toISOString(),
        };
        setSession({ ...session, state: nextState });
        try { await saveGameState(nextState); } catch { /* nonfatal */ }
        if (isBoardExhausted(nextGrid) && !state.hasGuessedCorrectly) {
          setGuessFeedback(null);
          setGuessInput("");
          setGuessPictureOpen(true);
        } else {
          setResult({
            kind: "error",
            title: "Ô này đã bị khóa!",
            body: "Không còn câu hỏi phụ cho mảnh ghép này.",
          });
        }
        return;
      }
    } else if (mainQuestion) {
      q = mainQuestion;
    } else {
      q = allQuestions[0] || {
        id: "default-q",
        type: "mcq",
        question: "Đảng Cộng sản Việt Nam được thành lập vào ngày tháng năm nào?",
        options: ["03/02/1930", "19/08/1945", "02/09/1945", "30/04/1975"],
        answer: "03/02/1930",
      };
    }

    setSelectedQuestion(q);
    setAnswer("");
    setSelectedMultiAnswers([]);
    setQuizState("answering");
    setIsCorrectResult(null);
    setQuestionOpen(true);
  };

  const triggerNextQuestion = () => {
    if (suggestedTargetIndex >= 0) {
      void handleCellClick(suggestedTargetIndex);
    }
  };

  // Bước 1: Kiểm tra đáp án và hiển thị trực quan ngay trên modal câu hỏi
  const checkAnswer = () => {
    if (!selectedQuestion) return;
    let correct = false;

    if (selectedQuestion.type === "multi_select") {
      if (selectedMultiAnswers.length === 0) return;
      const expectedAnswers = parseMultiSelectAnswers(selectedQuestion.answer, selectedQuestion.options);
      if (expectedAnswers.length === 0) {
        correct = false;
      } else {
        const normExpected = expectedAnswers.map(normalize).sort();
        const normSelected = selectedMultiAnswers.map(normalize).sort();
        correct =
          normExpected.length === normSelected.length &&
          normExpected.every((val, idx) => val === normSelected[idx]);
      }
    } else {
      if (!answer.trim()) return;
      correct = normalize(answer) === normalize(selectedQuestion.answer);
    }

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

    const allQuestions = session.config.stagesData.flatMap((s) => s.questions);
    const allMainQuestions = getMainQuestions(allQuestions);
    const mainQuestion = allMainQuestions[selectedTargetIndex] ?? allMainQuestions[0];
    const backups = mainQuestion ? getBackupsForParent(allQuestions, mainQuestion.id) : [];
    const usedBackupIds = [...(target.usedBackupIds ?? [])];

    let nextStatus: GridCellStatus["status"] = "failed";
    if (correct) {
      nextStatus = "built";
    } else {
      if (selectedQuestion.isBackup && !usedBackupIds.includes(selectedQuestion.id)) {
        usedBackupIds.push(selectedQuestion.id);
      }
      const remaining = backups.filter((item) => !usedBackupIds.includes(item.id));
      nextStatus = remaining.length === 0 ? "locked" : "failed";
    }

    const nextGrid = session.state.gridStatus.map((cell, index) =>
      index === selectedTargetIndex
        ? {
            ...cell,
            status: nextStatus,
            builtBy: correct ? member?.id ?? null : null,
            usedBackupIds,
          }
        : cell
    );

    const nextState: GameState = {
      ...session.state,
      gridStatus: nextGrid,
      completed: canEnterFinale({
        ...session.state,
        gridStatus: nextGrid,
      }),
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

    if (isBoardExhausted(nextGrid) && !session.state.hasGuessedCorrectly) {
      setGuessFeedback(null);
      setGuessInput("");
      setGuessPictureOpen(true);
    }
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
      const exhausted = isBoardExhausted(session.state.gridStatus);
      setGuessFeedback({
        kind: "success",
        message: exhausted
          ? `🎉 CHÍNH XÁC! Bức tranh bí mật là "${targetName}". Đang chuyển tới màn hình hoàn thành…`
          : `🎉 CHÍNH XÁC! Bạn đã đoán đúng bức tranh bí mật: "${targetName}"! Bạn có thể tiếp tục lật mở các ô còn lại để hoàn thành 100% công trình!`,
      });
      const nextState: GameState = {
        ...session.state,
        hasGuessedCorrectly: true,
        guessedName: targetName,
        completed: exhausted,
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
  const boardExhausted = isBoardExhausted(state.gridStatus);
  const mustGuessToFinish = boardExhausted && !hasGuessedCorrectly && !state.completed;
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
          <a
            href="/"
            className="exit-home-btn"
            title="Thoát ra màn hình chính"
            onClick={() => {
              audioRef.current?.pause();
            }}
          >
            <Home size={15} />
            <span>Thoát ra trang chủ</span>
          </a>
          <span className="session-pill">
            <span /> {isSupabaseConfigured() ? "Supabase Cloud Realtime" : "Local Realtime"}
          </span>
          <button
            type="button"
            className="admin-link"
            onClick={() => { window.location.href = `/admin?session=${config.sessionId}`; }}
          >
            <Settings size={15} /> Quản trị
          </button>
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
                const isLocked = cell.status === "locked";
                const isTarget = index === suggestedTargetIndex && !isLocked;

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
                    data-stage-active={!isBuilt && !isLocked}
                    role="gridcell"
                    title={
                      isBuilt
                        ? `Mảnh ghép số ${index + 1} (Đã hoàn thành)`
                        : isLocked
                        ? `Mảnh ghép số ${index + 1} (Đã khóa — hết câu phụ)`
                        : `Mảnh ghép số ${index + 1} (Nhấn để thi công)`
                    }
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
                    {isLocked && <span className="crack-overlay" aria-hidden="true">🔒</span>}
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
                : mustGuessToFinish
                ? "Đã hết câu hỏi có thể trả lời. Hãy đoán đúng tên bức tranh để sang màn hình hoàn thành!"
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
              <i className="legend-failed" /> Cần sửa (câu phụ)
            </span>
            <span>
              <i className="legend-locked" /> Đã khóa
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
              onClick={() => {
                if (mustGuessToFinish) {
                  setGuessFeedback(null);
                  setGuessInput("");
                  setGuessPictureOpen(true);
                  return;
                }
                triggerNextQuestion();
              }}
              disabled={isSaving || state.completed || (suggestedTargetIndex < 0 && !mustGuessToFinish)}
            >
              {mustGuessToFinish ? "Đoán bức tranh để hoàn thành" : <>Ô tiếp theo <ArrowRight size={17} /></>}
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
              {mustGuessToFinish
                ? "Bạn đã hết câu hỏi có thể trả lời (ô đã mở hết hoặc phần còn lại đã bị khóa). Hãy đoán đúng tên bức tranh bí mật để sang màn hình hoàn thành."
                : "Chọn bất kỳ ô nào chưa mở để trả lời câu hỏi và hé lộ từng mảnh ghép. Nếu bạn đã nhận ra bức tranh lịch sử bí mật phía sau, hãy bấm nút Đoán bức tranh bí mật để thử tài nhé!"}
            </p>
          </div>
        </aside>
      </section>

      {/* Dialog trả lời câu hỏi với phản hồi trực quan màu xanh/đỏ */}
      <Dialog open={questionOpen} onOpenChange={(open) => !isSaving && quizState === "answering" && setQuestionOpen(open)}>
        <DialogContent className="game-dialog sm:max-w-2xl">
          <DialogHeader>
            <span className="dialog-kicker">
              MẢNH GHÉP SỐ {selectedTargetIndex !== null ? selectedTargetIndex + 1 : ""} · {selectedQuestion?.isBackup ? "CÂU HỎI PHỤ" : "CÂU HỎI CHÍNH"}
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

          {selectedQuestion?.type === "true_false" ? (
            /* 1. Đúng / Sai */
            <div className="tf-options-grid">
              {["Đúng", "Sai"].map((opt) => {
                const isSelected = answer === opt;
                const isOptionCorrect = normalize(opt) === normalize(selectedQuestion.answer);

                let extraClass = opt === "Đúng" ? "btn-tf-game is-true" : "btn-tf-game is-false";
                if (quizState === "submitted") {
                  if (isOptionCorrect) extraClass += " is-correct";
                  else if (isSelected && !isOptionCorrect) extraClass += " is-wrong";
                  else extraClass += " is-dimmed";
                } else if (isSelected) {
                  extraClass += " is-chosen";
                }

                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={quizState === "submitted"}
                    className={extraClass}
                    onClick={() => setAnswer(opt)}
                  >
                    {opt === "Đúng" ? <Check size={28} /> : <X size={28} />}
                    <span>{opt.toUpperCase()}</span>
                    {quizState === "submitted" && isOptionCorrect && (
                      <span className="tf-badge-result correct">Đáp án chính xác</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : selectedQuestion?.type === "multi_select" ? (
            /* 2. Chọn nhiều đáp án */
            <div className="answer-options multi-select-options">
              {selectedQuestion.options.map((option, index) => {
                const expectedAnswers = parseMultiSelectAnswers(selectedQuestion.answer, selectedQuestion.options);
                const isSelected = selectedMultiAnswers.includes(option);
                const isOptionCorrect = expectedAnswers.map(normalize).includes(normalize(option));

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
                    type="button"
                    data-active={isSelected}
                    className={`multi-opt-btn ${extraClass}`}
                    disabled={quizState === "submitted"}
                    onClick={() => {
                      setSelectedMultiAnswers((prev) =>
                        prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option]
                      );
                    }}
                  >
                    <span className="checkbox-indicator">{isSelected ? <Check size={14} /> : null}</span>
                    <span className="option-code">{String.fromCharCode(65 + index)}</span>
                    <span className="option-text">{option}</span>
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
          ) : selectedQuestion?.type === "mcq" ? (
            /* 3. Trắc nghiệm đơn */
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
                    key={`${index}-${option}`}
                    type="button"
                    data-active={isSelected}
                    className={`multi-opt-btn ${extraClass}`}
                    disabled={quizState === "submitted"}
                    onClick={() => setAnswer(option)}
                  >
                    <span className="option-code">{String.fromCharCode(65 + index)}</span>
                    <span className="option-text">{option}</span>
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
            /* 4. Crossword */
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
                  {(() => {
                    let ansText = selectedQuestion?.answer ?? "";
                    if (selectedQuestion?.type === "multi_select") {
                      const parsed = parseMultiSelectAnswers(ansText, selectedQuestion.options);
                      if (parsed.length > 0) ansText = parsed.join(" ; ");
                    }
                    if (isCorrectResult) {
                      return `Đáp án đúng là: "${ansText}". Kỹ sư sẽ tiến hành gắn mảnh ghép này!`;
                    }
                    const mains = getMainQuestions(config.stagesData.flatMap((s) => s.questions));
                    const main = selectedTargetIndex != null ? mains[selectedTargetIndex] : undefined;
                    const backups = main ? getBackupsForParent(config.stagesData.flatMap((s) => s.questions), main.id) : [];
                    const used = [
                      ...(selectedTargetIndex != null ? (state.gridStatus[selectedTargetIndex]?.usedBackupIds ?? []) : []),
                    ];
                    if (selectedQuestion?.isBackup && selectedQuestion.id && !used.includes(selectedQuestion.id)) {
                      used.push(selectedQuestion.id);
                    }
                    const remaining = backups.filter((item) => !used.includes(item.id)).length;
                    return `Đáp án chính xác là: "${ansText}" (vừa được làm nổi bật màu xanh lá phía trên). ${
                      remaining > 0
                        ? `Lần sau ô này sẽ lấy ngẫu nhiên 1 trong ${remaining} câu hỏi phụ còn lại.`
                        : "Ô này đã hết câu hỏi phụ và sẽ bị khóa, không mở lại được."
                    }`;
                  })()}
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
                  disabled={
                    selectedQuestion?.type === "multi_select"
                      ? selectedMultiAnswers.length === 0
                      : !answer.trim()
                  }
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

      {/* Dialog Đoán Bức Tranh Bí Mật: bắt buộc khi hết câu hỏi, không kết thúc ván nếu vẫn còn ô chơi */}
      <Dialog
        open={guessPictureOpen}
        onOpenChange={(open) => {
          if (!open && mustGuessToFinish && !hasGuessedCorrectly && !peekingAtBoardRef.current) return;
          setGuessPictureOpen(open);
        }}
      >
        <DialogContent
          className="game-dialog sm:max-w-md"
          showCloseButton={!mustGuessToFinish || hasGuessedCorrectly}
          onPointerDownOutside={(event) => {
            if (mustGuessToFinish && !hasGuessedCorrectly) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (mustGuessToFinish && !hasGuessedCorrectly) event.preventDefault();
          }}
        >
          <DialogHeader>
            <span className="dialog-kicker" style={{ color: hasGuessedCorrectly ? "#166534" : "#d97706" }}>
              {hasGuessedCorrectly
                ? "🏆 ĐÃ ĐOÁN ĐÚNG BỨC TRANH!"
                : mustGuessToFinish
                ? "ĐOÁN TRANH ĐỂ HOÀN THÀNH"
                : "ĐOÁN BỨC TRANH BÍ MẬT"}
            </span>
            <DialogTitle>
              {hasGuessedCorrectly ? `"${guessedName}"` : mustGuessToFinish ? "Không còn câu hỏi nào nữa" : "Bạn đã nhận ra bức tranh?"}
            </DialogTitle>
            <DialogDescription>
              {hasGuessedCorrectly
                ? boardExhausted
                  ? "Chúc mừng! Bạn đã đoán chính xác. Đang chuyển tới màn hình hoàn thành…"
                  : "Chúc mừng! Bạn đã đoán chính xác bức tranh bí mật trong phiên chơi này. Hãy tiếp tục mở các ô còn lại để hoàn thiện 100% công trình!"
                : mustGuessToFinish
                ? "Bạn đã mở hết các ô có thể mở, hoặc phần còn lại đã bị khóa vì hết câu phụ. Hãy nhập đúng tên bức tranh bí mật để sang màn hình cuối."
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

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  peekingAtBoardRef.current = true;
                  setPeekingAtBoard(true);
                  setGuessPictureOpen(false);
                }}
                style={{ width: "100%", fontWeight: 700 }}
              >
                <Eye size={15} /> Xem lại bức tranh
              </Button>

              <DialogFooter style={{ marginTop: 8 }}>
                {!mustGuessToFinish && (
                  <Button type="button" variant="outline" onClick={() => setGuessPictureOpen(false)}>
                    Để sau
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={!guessInput.trim()}
                  style={{ background: "#b45309", color: "#fff", fontWeight: 700, width: mustGuessToFinish ? "100%" : undefined }}
                >
                  <Sparkles size={15} /> {mustGuessToFinish ? "Đoán để hoàn thành" : "Xác nhận đoán"}
                </Button>
              </DialogFooter>
            </form>
          )}

          {hasGuessedCorrectly && !boardExhausted && (
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
        <DialogContent className="game-dialog" style={{ maxWidth: 480, height: "auto" }}>
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
              <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
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
              disabled={isUploadingMusic}
              onClick={() => musicFileRef.current?.click()}
              style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}
            >
              <Upload size={16} /> {isUploadingMusic ? "Đang tải nhạc lên Supabase..." : "Tải file nhạc từ máy tính…"}
            </Button>
            <input
              ref={musicFileRef}
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={handleMusicFileChange}
            />
            {musicUrl && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10 }}>
                  <Music2 size={18} style={{ color: "#16a34a", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, overflow: "visible" }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#166534", display: "block" }}>ĐANG DÙNG NHẠC</span>
                    <span style={{ fontSize: "0.8rem", color: "#064e3b", display: "block", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>{musicUrl.startsWith("blob:") ? "File nhạc từ máy tính" : musicUrl}</span>
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
                <Button
                  type="button"
                  disabled={isApplyingAllMusic || !musicUrl}
                  onClick={() => void handleApplyMusicToAll()}
                  style={{
                    background: "#059669",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "8px 12px",
                  }}
                >
                  {isApplyingAllMusic ? "Đang đồng bộ..." : "🌍 Áp dụng nhạc này cho TẤT CẢ các phòng"}
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

      {peekingAtBoard && !guessPictureOpen && (
        <div className="board-peek-bar">
          <p>Ô đã mở vẫn hiện, ô khóa vẫn khóa. Quan sát xong hãy quay lại đoán tranh.</p>
          <Button
            type="button"
            onClick={() => {
              peekingAtBoardRef.current = false;
              setPeekingAtBoard(false);
              setGuessPictureOpen(true);
            }}
            style={{ background: "#b45309", color: "#fff", fontWeight: 700 }}
          >
            <Sparkles size={15} /> Tiếp tục đoán tranh
          </Button>
        </div>
      )}
    </main>
  );
}

