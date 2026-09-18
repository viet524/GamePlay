"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { ArrowRight, Check, Construction, Flag, Hammer, Heart, RotateCcw, Settings, Sparkles, Trophy, Users, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cellStage } from "@/lib/mock-game";
import { isSupabaseConfigured, loadSession, saveGameState, subscribeToGameState } from "@/lib/game-service";
import type { GameSession, GameState, Question, TeamMember } from "@/lib/game-types";

type Point = { x: number; y: number };
type BuilderPhase = "idle" | "running" | "hammering" | "celebrating" | "sad";
type ResultMessage = { kind: "success" | "error"; title: string; body: string } | null;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value: string) => value.trim().toLocaleLowerCase("vi").replace(/[.!?]+$/g, "");

function playSound(kind: "steps" | "hammer" | "success" | "crack" | "fanfare") {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const notes = kind === "fanfare" ? [392, 523, 659, 784, 1047] : kind === "success" ? [523, 659, 784] : kind === "crack" ? [180, 110, 70] : kind === "hammer" ? [240, 180, 240] : [120, 150, 120, 150];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === "crack" ? "sawtooth" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, context.currentTime + index * .14);
      gain.gain.exponentialRampToValueAtTime(.12, context.currentTime + index * .14 + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + index * .14 + .11);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * .14);
      oscillator.stop(context.currentTime + index * .14 + .13);
    });
    window.setTimeout(() => void context.close(), 1200);
  } catch { /* Audio is enhancement-only. */ }
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
  const [guessOpen, setGuessOpen] = useState(false);
  const [result, setResult] = useState<ResultMessage>(null);
  const [answer, setAnswer] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [guess, setGuess] = useState("");
  const [guessResult, setGuessResult] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let mounted = true;
    void loadSession(sessionId).then((loaded) => {
      if (!mounted) return;
      setSession(loaded);
      setSelectedMemberId(loaded.members[0]?.id ?? "");
      setActiveMember(loaded.members[0] ?? null);
    }).catch((error) => setLoadError(error instanceof Error ? error.message : "Không thể tải phiên chơi"));
    const unsubscribe = subscribeToGameState(sessionId, (state) => {
      setSession((current) => current ? { ...current, state } : current);
    });
    return () => { mounted = false; unsubscribe(); };
  }, [sessionId]);

  useEffect(() => {
    if (!session?.state.completed) return;
    playSound("fanfare");
    const end = Date.now() + 3800;
    const colors = ["#d92231", "#f2c551", "#ffffff", "#3d8a61"];
    const timer = window.setInterval(() => {
      confetti({ particleCount: 28, spread: 70, startVelocity: 36, origin: { x: .18, y: .2 }, colors });
      confetti({ particleCount: 28, spread: 70, startVelocity: 36, origin: { x: .82, y: .2 }, colors });
      if (Date.now() > end) window.clearInterval(timer);
    }, 320);
    return () => window.clearInterval(timer);
  }, [session?.state.completed]);

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

  useLayoutEffect(() => {
    if (session) setPosition(getHomePosition());
  }, [getHomePosition, session?.config.gridRows, session?.config.gridCols]);

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

  const moveToCell = useCallback(async (cellId: string) => {
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
  }, [getCellPosition, position.x, position.y]);

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

  const currentQuestion = useMemo<Question | null>(() => {
    if (!session) return null;
    const stage = session.config.stagesData.find((item) => item.stage === session.state.currentStage);
    if (!stage?.questions.length) return null;
    const cursor = session.state.questionCursor[String(session.state.currentStage)] ?? 0;
    return stage.questions[cursor % stage.questions.length];
  }, [session]);

  const targetIndex = useMemo(() => {
    if (!session) return -1;
    const total = session.state.gridStatus.length;
    return session.state.gridStatus.findIndex((cell, index) => cellStage(index, total) === session.state.currentStage && cell.status !== "built");
  }, [session]);

  const submitAnswer = async () => {
    if (!session || !currentQuestion || targetIndex < 0 || !selectedMemberId || !answer.trim()) return;
    const member = session.members.find((item) => item.id === selectedMemberId) ?? session.members[0];
    const correct = normalize(answer) === normalize(currentQuestion.answer);
    const target = session.state.gridStatus[targetIndex];
    setActiveMember(member);
    setQuestionOpen(false);
    setIsSaving(true);
    await moveToCell(target.cellId);
    setPhase("hammering");
    playSound("hammer");
    await delay(1450);

    const nextGrid = session.state.gridStatus.map((cell, index) => index === targetIndex ? {
      ...cell,
      status: correct ? "built" as const : "failed" as const,
      builtBy: correct ? member?.id ?? null : null,
    } : cell);
    const stageDone = nextGrid.every((cell, index) => cellStage(index, nextGrid.length) !== session.state.currentStage || cell.status === "built");
    const completed = correct && nextGrid.every((cell) => cell.status === "built");
    const nextState: GameState = {
      ...session.state,
      gridStatus: nextGrid,
      currentStage: completed ? 4 : stageDone ? Math.min(4, session.state.currentStage + 1) : session.state.currentStage,
      questionCursor: {
        ...session.state.questionCursor,
        [String(session.state.currentStage)]: (session.state.questionCursor[String(session.state.currentStage)] ?? 0) + 1,
      },
      completed,
      updatedAt: new Date().toISOString(),
    };
    setSession({ ...session, state: nextState });
    try { await saveGameState(nextState); } catch { /* Local state remains usable. */ }

    if (correct) {
      setPhase("celebrating");
      playSound("success");
      setResult({
        kind: "success",
        title: completed ? "Công trình đã hoàn thành!" : stageDone ? `Hoàn thành giai đoạn ${session.state.currentStage}` : "Thi công thành công!",
        body: completed ? "Toàn đội đã cùng nhau hoàn thiện công trình." : `Ô ${target.cellId} đã được xây bởi ${member?.name}.`,
      });
    } else {
      setPhase("sad");
      playSound("crack");
      setResult({ kind: "error", title: "Vật liệu hỏng!", body: "Cần kỹ sư khác sửa chữa. Câu hỏi dự phòng đã được nạp." });
    }
    await delay(900);
    setPhase("idle");
    setIsSaving(false);
    setAnswer("");
  };

  const checkGuess = () => {
    if (!session) return;
    setGuessResult(normalize(guess) === normalize(session.config.buildingName) ? "Chính xác! Đội nhận được quyền tự hào đặc biệt." : "Chưa đúng — hãy quan sát thêm các mảnh ghép.");
  };

  if (loadError) return <main className="loading-screen"><Construction /><h1>Không tải được phòng</h1><p>{loadError}</p></main>;
  if (!session) return <main className="loading-screen"><span className="loader" /><p>Đang dựng công trường…</p></main>;

  const { config, members, state } = session;
  const totalBuilt = state.gridStatus.filter((cell) => cell.status === "built").length;
  const progress = Math.round((totalBuilt / state.gridStatus.length) * 100);
  const currentStage = config.stagesData.find((item) => item.stage === state.currentStage) ?? config.stagesData[0];
  const initials = (activeMember?.name ?? "Kỹ sư").split(" ").slice(-2).map((part) => part[0]).join("").toUpperCase();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><Hammer size={21} strokeWidth={2.6} /></div>
        <div className="brand-copy"><p>XÂY NGÔI NHÀ ĐẢNG VỮNG MẠNH</p><span>Phòng: {config.sessionName}</span></div>
        <div className="header-actions">
          <span className="session-pill"><span /> {isSupabaseConfigured() ? "Supabase realtime" : "Demo realtime"}</span>
          <Link href="/admin" className="admin-link"><Settings size={15} /> Quản trị</Link>
        </div>
      </header>

      <section className="workspace">
        <div className="construction-panel">
          <div className="section-heading">
            <div><p className="eyebrow">KHU VỰC THI CÔNG</p><h1>{currentStage.description}</h1></div>
            <div className="stage-chip"><span>{String(state.currentStage).padStart(2, "0")}</span> Giai đoạn {state.currentStage}: {currentStage.name}</div>
          </div>

          <div className={`site-frame ${state.completed ? "is-complete" : ""}`} ref={stageRef}>
            <div className="site-sky" aria-hidden="true"><span className="sun" /><span className="cloud cloud-one" /><span className="cloud cloud-two" /></div>
            <div className="crane" aria-hidden="true"><span className="crane-mast" /><span className="crane-arm" /><span className="crane-cable" /><span className="crane-hook" /></div>
            <div className="scaffold scaffold-left" aria-hidden="true" /><div className="scaffold scaffold-right" aria-hidden="true" />

            <div className="build-grid" role="grid" aria-label={`Lưới công trình ${config.gridRows} hàng ${config.gridCols} cột`} style={{ gridTemplateColumns: `repeat(${config.gridCols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${config.gridRows}, minmax(0, 1fr))` }}>
              {state.gridStatus.map((cell, index) => {
                const row = Math.floor(index / config.gridCols);
                const col = index % config.gridCols;
                const isBuilt = cell.status === "built";
                const isFailed = cell.status === "failed";
                const isTarget = index === targetIndex;
                const backgroundPosition = `${config.gridCols === 1 ? 0 : col / (config.gridCols - 1) * 100}% ${config.gridRows === 1 ? 0 : row / (config.gridRows - 1) * 100}%`;
                return (
                  <button
                    key={cell.cellId}
                    ref={(node) => { cellRefs.current[cell.cellId] = node; }}
                    className="grid-cell"
                    data-status={cell.status}
                    data-target={isTarget}
                    role="gridcell"
                    aria-label={`Ô ${index + 1}, ${isBuilt ? "đã xây" : isFailed ? "cần sửa" : "đang chờ"}`}
                    onClick={() => !isSaving && void moveToCell(cell.cellId).then(() => setPhase("idle"))}
                    style={isBuilt ? { backgroundImage: `url("${config.buildingImageUrl}")`, backgroundSize: `${config.gridCols * 100}% ${config.gridRows * 100}%`, backgroundPosition } : undefined}
                  >
                    <span className="cell-index">{String(index + 1).padStart(2, "0")}</span>
                    {!isBuilt && <span className="cell-cross" aria-hidden="true" />}
                    {isFailed && <span className="crack-overlay" aria-hidden="true">✕</span>}
                    {isTarget && !isBuilt && <span className="target-pulse" aria-hidden="true" />}
                    {isBuilt && <span className="built-check"><Check size={13} /></span>}
                  </button>
                );
              })}
            </div>

            <div className="builder-sprite" data-phase={phase} data-direction={direction} style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)`, transitionDuration: `${duration}ms` }} aria-label={`Nhân vật kỹ sư ${activeMember?.name ?? ""}`}>
              <span className="builder-shadow" />
              <span className="builder-character">
                <span className="hard-hat" />
                <span className="builder-head" style={activeMember?.avatarUrl ? { backgroundImage: `url("${activeMember.avatarUrl}")` } : undefined}>{activeMember?.avatarUrl ? "" : initials}</span>
                <span className="builder-body"><span className="vest-line" /></span>
                <span className="builder-arm builder-arm-left" /><span className="builder-arm builder-arm-right"><Hammer size={19} /></span>
                <span className="builder-leg builder-leg-left" /><span className="builder-leg builder-leg-right" />
                {phase === "sad" && <span className="tear">●</span>}
                {phase === "celebrating" && <span className="celebrate-star">★</span>}
              </span>
            </div>

            {state.completed && <>
              <div className="flag-pole"><span className="vietnam-flag">★</span></div>
              <div className="confetti" aria-hidden="true">{Array.from({ length: 42 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div>
            </>}
            <div className="ground-strip" aria-hidden="true" />
            <div className="site-instruction"><Sparkles size={16} /> {isSaving ? phase === "hammering" ? "Đang thi công…" : "Kỹ sư đang di chuyển…" : "Trả lời câu hỏi hoặc chọn ô để thử chuyển động"}</div>
          </div>

          <div className="legend-row"><span><i className="legend-empty" /> Đang chờ</span><span><i className="legend-built" /> Đã xây</span><span><i className="legend-failed" /> Cần sửa</span><span className="coordinate-readout">Ô tiếp theo: <b>{targetIndex >= 0 ? state.gridStatus[targetIndex].cellId : "Hoàn tất"}</b></span></div>
        </div>

        <aside className="control-panel">
          <div className="progress-card">
            <div className="progress-title"><div><p>TIẾN ĐỘ CÔNG TRÌNH</p><strong>{totalBuilt}/{state.gridStatus.length} mảnh ghép</strong></div><div className="progress-number">{progress}%</div></div>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <div className="stage-list">{config.stagesData.map((stage) => {
              const done = state.gridStatus.every((cell, index) => cellStage(index, state.gridStatus.length) !== stage.stage || cell.status === "built");
              const locked = stage.stage > state.currentStage;
              return <div key={stage.stage} className={stage.stage === state.currentStage ? "active" : done ? "done" : locked ? "locked" : ""}><span>{done ? <Check size={13} /> : stage.stage}</span>{stage.name}</div>;
            })}</div>
          </div>

          <div className="team-card">
            <div className="card-label"><span><Users size={16} /> ĐỘI KỸ SƯ</span><b>{members.length} thành viên</b></div>
            <div className="member-list">{members.map((member) => <button className="member-row" key={member.id} data-active={activeMember?.id === member.id} onClick={() => setActiveMember(member)}><span className="avatar" style={{ "--avatar-color": member.color, backgroundImage: member.avatarUrl ? `url("${member.avatarUrl}")` : undefined } as React.CSSProperties}>{member.avatarUrl ? "" : member.name.split(" ").slice(-2).map((part) => part[0]).join("")}</span><span><strong>{member.name}</strong><small>{activeMember?.id === member.id ? "Đang thi công" : "Sẵn sàng"}</small></span>{activeMember?.id === member.id && <i className="active-dot" />}</button>)}</div>
          </div>

          <div className="action-stack">
            <Button className="primary-action" onClick={() => setQuestionOpen(true)} disabled={isSaving || state.completed || !currentQuestion}>Câu hỏi tiếp theo <ArrowRight size={17} /></Button>
            <Button className="guess-action" variant="outline" onClick={() => { setGuessResult(""); setGuessOpen(true); }} disabled={isSaving}><Flag size={16} /> Đoán công trình</Button>
            <Button className="reset-action" variant="ghost" onClick={() => void resetBuilder()} disabled={isSaving || !activeCell}><RotateCcw size={15} /> Đưa kỹ sư về vị trí đầu</Button>
          </div>

          <div className="phase-note"><span>GIAI ĐOẠN {state.currentStage} · {currentStage.name.toUpperCase()}</span><p>{currentStage.description}. Hoàn thành toàn bộ ô trong giai đoạn để mở khóa phần tiếp theo.</p></div>
        </aside>
      </section>

      <Dialog open={questionOpen} onOpenChange={(open) => !isSaving && setQuestionOpen(open)}>
        <DialogContent className="game-dialog sm:max-w-2xl">
          <DialogHeader><span className="dialog-kicker">GIAI ĐOẠN {state.currentStage} · CÂU {(state.questionCursor[String(state.currentStage)] ?? 0) + 1}</span><DialogTitle>{currentQuestion?.question}</DialogTitle><DialogDescription>Chọn kỹ sư thi công, sau đó chốt đáp án.</DialogDescription></DialogHeader>
          <div className="engineer-picker">{members.map((member) => <button key={member.id} data-active={selectedMemberId === member.id} onClick={() => setSelectedMemberId(member.id)}><span className="avatar" style={{ "--avatar-color": member.color, backgroundImage: member.avatarUrl ? `url("${member.avatarUrl}")` : undefined } as React.CSSProperties}>{member.avatarUrl ? "" : member.name.split(" ").pop()?.[0]}</span><b>{member.name}</b></button>)}</div>
          {currentQuestion?.type === "mcq" ? <div className="answer-options">{currentQuestion.options.map((option, index) => <button key={option} data-active={answer === option} onClick={() => setAnswer(option)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div> : <label className="crossword-answer"><span>ĐÁP ÁN Ô CHỮ</span><input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Nhập câu trả lời…" autoFocus /></label>}
          <DialogFooter><Button variant="ghost" onClick={() => setQuestionOpen(false)}>Để sau</Button><Button onClick={() => void submitAnswer()} disabled={!answer.trim() || !selectedMemberId}><Hammer size={16} /> Chốt đáp án</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={guessOpen} onOpenChange={setGuessOpen}><DialogContent className="game-dialog"><DialogHeader><span className="dialog-kicker">THỬ THÁCH ĐẶC BIỆT</span><DialogTitle>Đoán tên công trình</DialogTitle><DialogDescription>Quan sát những mảnh ghép đã mở và nhập phán đoán của đội.</DialogDescription></DialogHeader><label className="crossword-answer"><span>TÊN CÔNG TRÌNH</span><input value={guess} onChange={(event) => setGuess(event.target.value)} placeholder="Nhập tên công trình…" /></label>{guessResult && <p className="guess-result"><Heart size={16} /> {guessResult}</p>}<DialogFooter><Button onClick={checkGuess}>Kiểm tra dự đoán</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(result)} onOpenChange={(open) => !open && setResult(null)}><DialogContent className={`result-dialog ${result?.kind ?? ""}`}><div className="result-icon">{result?.kind === "success" ? <Trophy /> : <Construction />}</div><DialogHeader><DialogTitle>{result?.title}</DialogTitle><DialogDescription>{result?.body}</DialogDescription></DialogHeader><Button onClick={() => setResult(null)}>Tiếp tục</Button></DialogContent></Dialog>

      {state.completed && <div className="climax-overlay"><div><Trophy /><span>CÔNG TRÌNH HOÀN THÀNH</span><h2>“{config.quoteText}”</h2><p>— Chủ tịch Hồ Chí Minh</p><Button onClick={() => setGuessOpen(true)}><Volume2 size={16} /> Khám phá công trình</Button></div></div>}
    </main>
  );
}
