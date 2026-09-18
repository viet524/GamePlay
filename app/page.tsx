"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, Flag, Hammer, RotateCcw, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const GAME_CONFIG = {
  sessionName: "Chi bộ Tiên phong",
  rows: 4,
  cols: 5,
  currentStage: 1,
  stageName: "Móng",
  totalStages: 4,
};

const TEAM_MEMBERS = [
  { id: "m1", name: "Minh Anh", initials: "MA", color: "#edb73b" },
  { id: "m2", name: "Quang Huy", initials: "QH", color: "#65b88a" },
  { id: "m3", name: "Thu Hà", initials: "TH", color: "#e87d66" },
  { id: "m4", name: "Đức Long", initials: "ĐL", color: "#5f93ca" },
];

const CELLS = Array.from({ length: GAME_CONFIG.rows * GAME_CONFIG.cols }, (_, index) => ({
  id: `${Math.floor(index / GAME_CONFIG.cols)}_${index % GAME_CONFIG.cols}`,
  row: Math.floor(index / GAME_CONFIG.cols),
  col: index % GAME_CONFIG.cols,
}));

type Point = { x: number; y: number };

export default function Home() {
  const stageRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [duration, setDuration] = useState(900);

  const getHomePosition = useCallback((): Point => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    return { x: 0, y: Math.max(12, stage.getBoundingClientRect().height - 124) };
  }, []);

  const getCellPosition = useCallback((cellId: string): Point | null => {
    const stage = stageRef.current;
    const cell = cellRefs.current[cellId];
    if (!stage || !cell) return null;

    // Phase 2: đo tọa độ thật trên màn hình thay vì suy đoán từ kích thước CSS.
    const stageRect = stage.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const spriteWidth = 72;
    const spriteHeight = 102;
    const originLeft = -76;

    return {
      x: cellRect.left - stageRect.left + cellRect.width / 2 - spriteWidth / 2 - originLeft,
      y: cellRect.top - stageRect.top + cellRect.height / 2 - spriteHeight + 18,
    };
  }, []);

  useLayoutEffect(() => {
    setPosition(getHomePosition());
  }, [getHomePosition]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const observer = new ResizeObserver(() => {
      const nextPosition = selectedCell ? getCellPosition(selectedCell) : getHomePosition();
      if (nextPosition) setPosition(nextPosition);
    });

    observer.observe(stage);
    return () => observer.disconnect();
  }, [getCellPosition, getHomePosition, selectedCell]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const moveBuilder = (cellId: string) => {
    const target = getCellPosition(cellId);
    if (!target) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    const distance = Math.hypot(target.x - position.x, target.y - position.y);
    const nextDuration = Math.min(1500, Math.max(650, distance * 1.8));

    setDirection(target.x >= position.x ? "right" : "left");
    setDuration(nextDuration);
    setSelectedCell(cellId);
    setIsMoving(true);
    setPosition(target);

    timerRef.current = setTimeout(() => setIsMoving(false), nextDuration);
  };

  const resetBuilder = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const home = getHomePosition();
    setDirection(home.x >= position.x ? "right" : "left");
    setDuration(900);
    setSelectedCell(null);
    setIsMoving(true);
    setPosition(home);
    timerRef.current = setTimeout(() => setIsMoving(false), 900);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><Hammer size={21} strokeWidth={2.6} /></div>
        <div className="brand-copy">
          <p>XÂY NGÔI NHÀ ĐẢNG VỮNG MẠNH</p>
          <span>Phiên thử nghiệm · Phase 1–2</span>
        </div>
        <div className="session-pill"><span /> {GAME_CONFIG.sessionName}</div>
      </header>

      <section className="workspace">
        <div className="construction-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">KHU VỰC THI CÔNG</p>
              <h1>Đặt nền móng đầu tiên</h1>
            </div>
            <div className="stage-chip"><span>01</span> Giai đoạn {GAME_CONFIG.currentStage}: {GAME_CONFIG.stageName}</div>
          </div>

          <div className="site-frame" ref={stageRef}>
            <div className="site-sky" aria-hidden="true">
              <span className="sun" />
              <span className="cloud cloud-one" />
              <span className="cloud cloud-two" />
            </div>
            <div className="crane" aria-hidden="true">
              <span className="crane-mast" /><span className="crane-arm" /><span className="crane-cable" /><span className="crane-hook" />
            </div>
            <div className="scaffold scaffold-left" aria-hidden="true" />
            <div className="scaffold scaffold-right" aria-hidden="true" />

            <div
              className="build-grid"
              role="grid"
              aria-label={`Lưới công trình ${GAME_CONFIG.rows} hàng ${GAME_CONFIG.cols} cột`}
              style={{
                gridTemplateColumns: `repeat(${GAME_CONFIG.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${GAME_CONFIG.rows}, minmax(0, 1fr))`,
              }}
            >
              {CELLS.map((cell, index) => {
                const isSelected = selectedCell === cell.id;
                return (
                  <button
                    key={cell.id}
                    ref={(node) => { cellRefs.current[cell.id] = node; }}
                    className="grid-cell"
                    data-selected={isSelected}
                    role="gridcell"
                    aria-label={`Ô ${index + 1}, hàng ${cell.row + 1}, cột ${cell.col + 1}`}
                    aria-pressed={isSelected}
                    onClick={() => moveBuilder(cell.id)}
                  >
                    <span className="cell-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="cell-cross" aria-hidden="true" />
                    {isSelected && <span className="target-pulse" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <div
              className="builder-sprite"
              data-moving={isMoving}
              data-direction={direction}
              style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
                transitionDuration: `${duration}ms`,
              }}
              aria-label="Nhân vật kỹ sư Minh Anh"
            >
              <span className="builder-shadow" />
              <span className="builder-character">
                <span className="hard-hat" />
                <span className="builder-head">MA</span>
                <span className="builder-body"><span className="vest-line" /></span>
                <span className="builder-arm builder-arm-left" />
                <span className="builder-arm builder-arm-right"><Hammer size={19} /></span>
                <span className="builder-leg builder-leg-left" />
                <span className="builder-leg builder-leg-right" />
              </span>
            </div>

            <div className="ground-strip" aria-hidden="true" />
            <div className="site-instruction"><Sparkles size={16} /> Chọn một ô để điều động kỹ sư</div>
          </div>

          <div className="legend-row">
            <span><i className="legend-empty" /> Ô đang chờ</span>
            <span><i className="legend-target" /> Vị trí đã chọn</span>
            <span className="coordinate-readout">Tọa độ đích: <b>{selectedCell ?? "—"}</b></span>
          </div>
        </div>

        <aside className="control-panel">
          <div className="progress-card">
            <div className="progress-title">
              <div><p>TIẾN ĐỘ CÔNG TRÌNH</p><strong>Giai đoạn {GAME_CONFIG.currentStage}/{GAME_CONFIG.totalStages}</strong></div>
              <div className="progress-number">25%</div>
            </div>
            <div className="progress-track"><span style={{ width: "25%" }} /></div>
            <div className="stage-list">
              {["Móng", "Cột", "Tường", "Mái"].map((stage, index) => (
                <div key={stage} className={index === 0 ? "active" : ""}>
                  <span>{index === 0 ? <Check size={13} /> : index + 1}</span>{stage}
                </div>
              ))}
            </div>
          </div>

          <div className="team-card">
            <div className="card-label"><span><Users size={16} /> ĐỘI KỸ SƯ</span><b>{TEAM_MEMBERS.length} thành viên</b></div>
            <div className="member-list">
              {TEAM_MEMBERS.map((member, index) => (
                <button className="member-row" key={member.id} data-active={index === 0}>
                  <span className="avatar" style={{ "--avatar-color": member.color } as React.CSSProperties}>{member.initials}</span>
                  <span><strong>{member.name}</strong><small>{index === 0 ? "Đang thi công" : "Sẵn sàng"}</small></span>
                  {index === 0 && <i className="active-dot" />}
                </button>
              ))}
            </div>
          </div>

          <div className="action-stack">
            <Button className="primary-action" disabled>
              Câu hỏi tiếp theo <ArrowRight size={17} />
            </Button>
            <Button className="guess-action" variant="outline" disabled>
              <Flag size={16} /> Đoán công trình
            </Button>
            <Button className="reset-action" variant="ghost" onClick={resetBuilder} disabled={!selectedCell}>
              <RotateCcw size={15} /> Đưa kỹ sư về vị trí đầu
            </Button>
          </div>

          <div className="phase-note">
            <span>DEMO TƯƠNG TÁC</span>
            <p>Chức năng câu hỏi sẽ được mở ở Phase 3. Hiện tại, hãy kiểm tra độ chính xác của chuyển động trên lưới.</p>
          </div>
        </aside>
      </section>

      <p className="sr-only" aria-live="polite">
        {selectedCell ? `Kỹ sư đang di chuyển đến ô ${selectedCell}` : "Kỹ sư ở vị trí xuất phát"}
      </p>
    </main>
  );
}
