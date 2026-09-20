"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { ArrowLeft, Home, RotateCcw, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadSession, resetGameState } from "@/lib/game-service";
import type { GameSession } from "@/lib/game-types";

function playFanfare() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    [392, 523, 659, 784, 1047].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + index * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.16 + 0.3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * 0.16);
      oscillator.stop(context.currentTime + index * 0.16 + 0.32);
    });
    window.setTimeout(() => void context.close(), 1700);
  } catch {
    /* Audio enhancement only */
  }
}

function launchFireworks() {
  const colors = ["#da251d", "#ffdf00", "#fff5c7", "#ffffff"];
  const endsAt = Date.now() + 5200;
  const timer = window.setInterval(() => {
    confetti({
      particleCount: 48,
      angle: 62,
      spread: 68,
      startVelocity: 48,
      origin: { x: 0.08, y: 0.62 },
      colors,
    });
    confetti({
      particleCount: 48,
      angle: 118,
      spread: 68,
      startVelocity: 48,
      origin: { x: 0.92, y: 0.62 },
      colors,
    });
    if (Date.now() > endsAt) window.clearInterval(timer);
  }, 420);
  return () => window.clearInterval(timer);
}

export function FinaleScene({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<GameSession | null>(null);
  const [showMessage, setShowMessage] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    void loadSession(sessionId).then(setSession);
  }, [sessionId]);

  useEffect(() => {
    if (!session?.state.completed) return;
    const stopFireworks = launchFireworks();
    playFanfare();
    const messageTimer = window.setTimeout(() => setShowMessage(true), 1200);
    return () => {
      stopFireworks();
      window.clearTimeout(messageTimer);
    };
  }, [session?.state.completed]);

  const handleReset = async () => {
    if (!session) return;
    setIsResetting(true);
    try {
      await resetGameState(session);
      router.push(`/play/${sessionId}`);
    } catch {
      router.push(`/play/${sessionId}`);
    } finally {
      setIsResetting(false);
    }
  };

  if (!session)
    return (
      <main className="loading-screen">
        <span className="loader" />
        <p>Đang chuẩn bị lễ công bố bức tranh lịch sử…</p>
      </main>
    );

  if (!session.state.completed)
    return (
      <main className="finale-locked">
        <Sparkles size={42} style={{ color: "#d97706" }} />
        <h1>Bức tranh chưa hoàn thành</h1>
        <p>Hãy hoàn tất trả lời các ô câu hỏi trước khi chiêm ngưỡng bức tranh trọn vẹn.</p>
        <Button asChild>
          <Link href={`/play/${sessionId}`}>
            <ArrowLeft /> Trở lại thi công
          </Link>
        </Button>
      </main>
    );

  return (
    <main className="finale-shell">
      <div className="finale-rays" aria-hidden="true" />
      <div className="finale-stars" aria-hidden="true">★</div>

      {/* Khung trưng bày Bức tranh Lịch sử Toàn cảnh */}
      <section className="finale-gallery">
        <div className="finale-gallery-card">
          <div
            className="finale-gallery-image"
            style={{
              backgroundImage: `url("${session.config.buildingImageUrl || "/symbolic-party-house.jpg"}")`,
            }}
          >
            <div className="gallery-glow-overlay" />
            <span className="gallery-badge">
              <Sparkles size={16} /> BỨC TRANH LỊCH SỬ ĐÃ HOÀN TẤT
            </span>
          </div>

          <div className={`finale-tribute ${showMessage ? "show" : ""}`}>
            <p className="tribute-eyebrow">VINH QUANG KHÁT VỌNG · RỰC RỠ NIỀM TIN</p>
            <h1 className="tribute-title">{session.config.buildingName}</h1>
            <blockquote className="tribute-quote">
              “{session.config.quoteText}”
            </blockquote>
            <span className="tribute-author">— Chủ tịch Hồ Chí Minh & Đảng Cộng sản Việt Nam</span>

            <div className="finale-actions">
              <Button
                onClick={() => {
                  playFanfare();
                  launchFireworks();
                }}
                className="btn-fanfare"
              >
                <Volume2 size={16} /> Phát lại khoảnh khắc
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleReset()}
                disabled={isResetting}
                className="btn-reset"
              >
                <RotateCcw size={16} /> {isResetting ? "Đang đặt lại…" : "Chơi lại từ đầu"}
              </Button>
              <Button asChild variant="outline" className="btn-home">
                <Link href="/">
                  <Home size={16} /> Về thư viện phòng
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
