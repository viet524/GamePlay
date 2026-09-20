"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  Upload,
  Users,
  Building2,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OFFICIAL_SESSION_ID,
  createDemoSession,
  createGridStatus,
  getAutomaticGrid,
} from "@/lib/mock-game";
import {
  isSupabaseConfigured,
  listPublicRooms,
  loadSession,
  saveSession,
  uploadAsset,
} from "@/lib/game-service";
import type { GameSession, Question, RoomSummary } from "@/lib/game-types";

const COLORS = ["#b91f2e", "#276745", "#d97706", "#2563eb", "#7c3aed", "#db2777"];

/**
 * Khởi tạo phòng thi công mới HOÀN TOÀN TRỐNG:
 * - Không có câu hỏi nào (để người dùng tự thêm từ đầu).
 * - Sử dụng ảnh cover công trường bí mật mặc định (cho đến khi người dùng tải ảnh công trình riêng).
 * - Sinh mã Session ID mới độc nhất.
 */
function createBlankSession(): GameSession {
  const sessionId = crypto.randomUUID();
  return {
    config: {
      sessionId,
      sessionName: "Phòng thi công mới",
      authorName: "",
      buildingName: "Ngôi Nhà Đảng Vững Mạnh",
      // Ảnh công trình bí mật (hiển thị khi hé lộ các ô) - khác biệt hoàn toàn với ảnh bìa bên ngoài (/construction-cover.jpg)
      buildingImageUrl: "/symbolic-party-house.jpg",
      gridRows: 2,
      gridCols: 2,
      quoteText: "Đoàn kết, kỷ cương, đổi mới, phát triển!",
      stagesData: [
        { stage: 1, name: "Bộ câu hỏi thi công", description: "Lật mở bức tranh bí mật", questions: [] },
      ],
    },
    members: [
      {
        id: crypto.randomUUID(),
        sessionId,
        name: "Kỹ sư trưởng",
        avatarUrl: "",
        color: COLORS[0],
      },
    ],
    state: {
      sessionId,
      currentStage: 1,
      gridStatus: createGridStatus(2, 2),
      questionCursor: { "1": 0, "2": 0, "3": 0, "4": 0 },
      completed: false,
      updatedAt: new Date().toISOString(),
    },
  };
}

export default function AdminPage() {
  const [session, setSession] = useState<GameSession>(() =>
    createDemoSession(OFFICIAL_SESSION_ID)
  );
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    void listPublicRooms().then((loadedRooms) => {
      if (!mounted) return;
      setRooms(loadedRooms);

      const urlParams = new URLSearchParams(window.location.search);
      const requestedSession = urlParams.get("session");

      // Nếu có chỉ định ?session= thì nạp đúng phòng đó:
      if (requestedSession) {
        void loadSession(requestedSession)
          .then((s) => {
            if (mounted) setSession(s);
          })
          .catch(() => {
            if (mounted) setStatus("Không thể tải phòng được yêu cầu.");
          });
        return;
      }

      // Nếu vào /admin thông thường, nạp phòng đầu tiên có trong database:
      if (loadedRooms.length > 0) {
        const defaultRoomId = loadedRooms[0].sessionId;
        void loadSession(defaultRoomId)
          .then((s) => {
            if (mounted) {
              setSession(s);
              window.history.replaceState(null, "", `/admin?session=${defaultRoomId}`);
            }
          })
          .catch(() => {
            if (mounted) setStatus("Không thể nạp phòng mặc định.");
          });
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const switchRoom = async (targetId: string) => {
    setStatus("Đang tải phòng…");
    try {
      const loaded = await loadSession(targetId);
      setSession(loaded);
      window.history.replaceState(null, "", `/admin?session=${targetId}`);
      setStatus(`Đã chuyển sang chỉnh sửa phòng: ${loaded.config.sessionName}`);
    } catch {
      setStatus("Không thể tải phòng này.");
    }
  };

  const updateConfig = <K extends keyof GameSession["config"]>(
    key: K,
    value: GameSession["config"][K]
  ) => {
    setSession((current) => ({
      ...current,
      config: { ...current.config, [key]: value },
    }));
  };

  const updateQuestion = (questionId: string, patch: Partial<Question>) => {
    setSession((current) => ({
      ...current,
      config: {
        ...current.config,
        stagesData: current.config.stagesData.map((stage) => ({
          ...stage,
          questions: stage.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)),
        })),
      },
    }));
  };

  const addQuestion = (isBackup = false) => {
    const newQ: Question = {
      id: crypto.randomUUID(),
      type: "mcq",
      question: "",
      options: ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
      answer: "",
      isBackup,
    };
    setSession((current) => {
      const stages = current.config.stagesData.length > 0
        ? current.config.stagesData
        : [{ stage: 1, name: "Câu hỏi thi công", description: "Bộ câu hỏi lật mở bức tranh", questions: [] }];
      return {
        ...current,
        config: {
          ...current.config,
          stagesData: stages.map((s, idx) =>
            idx === 0 ? { ...s, questions: [...s.questions, newQ] } : s
          ),
        },
      };
    });
  };

  const removeQuestion = (questionId: string) => {
    setSession((current) => ({
      ...current,
      config: {
        ...current.config,
        stagesData: current.config.stagesData.map((stage) => ({
          ...stage,
          questions: stage.questions.filter((q) => q.id !== questionId),
        })),
      },
    }));
  };

  const handleFile = async (
    file: File | undefined,
    kind: "building" | "avatar",
    memberIndex?: number
  ) => {
    if (!file) return;
    setStatus("Đang tải ảnh lên Supabase Storage…");
    try {
      const url = await uploadAsset(file, session.config.sessionId, kind);
      if (kind === "building") updateConfig("buildingImageUrl", url);
      else if (memberIndex !== undefined)
        setSession((current) => ({
          ...current,
          members: current.members.map((member, index) =>
            index === memberIndex ? { ...member, avatarUrl: url } : member
          ),
        }));
      setStatus("Đã cập nhật ảnh thành công.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể tải ảnh");
    }
  };

  const addMember = () => {
    setSession((current) => ({
      ...current,
      members: [
        ...current.members,
        {
          id: crypto.randomUUID(),
          sessionId: current.config.sessionId,
          name: `Thành viên ${current.members.length + 1}`,
          avatarUrl: "",
          color: COLORS[current.members.length % COLORS.length],
        },
      ],
    }));
  };

  // Lưu cấu hình: Cố định vào session_id hiện tại của phòng
  const save = async () => {
    const mainQuestions = session.config.stagesData
      .flatMap((s) => s.questions)
      .filter((q) => !q.isBackup);
    if (mainQuestions.length < 4) {
      setStatus("❌ Cần có ít nhất 4 câu hỏi chính để tạo lưới thi công ô vuông (tối thiểu 2×2)!");
      return;
    }

    setSaving(true);
    setStatus("Đang lưu cấu hình vào Supabase…");
    const { rows, cols } = getAutomaticGrid(session.config.stagesData);
    const next: GameSession = {
      ...session,
      config: { ...session.config, gridRows: rows, gridCols: cols },
      state:
        session.state.gridStatus.length === rows * cols
          ? session.state
          : {
              ...session.state,
              gridStatus: createGridStatus(rows, cols),
              currentStage: 1,
              completed: false,
            },
    };
    try {
      await saveSession(next);
      setSession(next);
      window.history.replaceState(null, "", `/admin?session=${next.config.sessionId}`);

      // Cập nhật lại danh sách phòng
      const updatedRooms = await listPublicRooms();
      setRooms(updatedRooms);

      setStatus(`✅ Đã lưu thành công phòng: "${next.config.sessionName}" vào Supabase!`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể lưu cấu hình");
    } finally {
      setSaving(false);
    }
  };

  const playPath = `/play/${session.config.sessionId}`;
  const automaticGrid = getAutomaticGrid(session.config.stagesData);
  const allQuestions = session.config.stagesData.flatMap((stage) => stage.questions);
  const allMainQuestions = allQuestions.filter((q) => !q.isBackup);
  const allBackupQuestions = allQuestions.filter((q) => q.isBackup);
  const totalQuestions = allQuestions.length;

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link href="/" className="back-link">
          <ArrowLeft size={17} /> Về thư viện
        </Link>
        <div>
          <span>TRUNG TÂM ĐIỀU HÀNH</span>
          <h1>Quản lý phòng thi công</h1>
        </div>
        <div className={`connection-badge ${isSupabaseConfigured() ? "online" : "local"}`}>
          <i /> {isSupabaseConfigured() ? "Supabase Cloud" : "Demo cục bộ"}
        </div>
      </header>

      <div className="admin-layout">
        <aside className="admin-summary">
          {/* Bộ chọn phòng đang có */}
          <div className="summary-card">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Building2 size={13} /> PHÒNG ĐANG CHỈNH SỬA
            </span>
            {rooms.length > 0 && (
              <select
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d9cdb4",
                  background: "#faf6ed",
                  color: "#173b32",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  width: "100%",
                }}
                value={session.config.sessionId}
                onChange={(e) => void switchRoom(e.target.value)}
              >
                {rooms.map((r) => (
                  <option key={r.sessionId} value={r.sessionId}>
                    {r.sessionName}
                  </option>
                ))}
              </select>
            )}

            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: "0.68rem", color: "#8a7550", fontWeight: 700 }}>
                MÃ SESSION (CỐ ĐỊNH):
              </span>
              <code style={{ display: "block", marginTop: 2, fontSize: "0.95rem" }}>
                {session.config.sessionId}
              </code>
            </div>
          </div>

          <div
            className="summary-preview"
            style={{
              backgroundImage: `url("${session.config.buildingImageUrl || "/symbolic-party-house.jpg"}")`,
            }}
          >
            <span>ẢNH CÔNG TRÌNH BÍ MẬT</span>
          </div>

          <div className="summary-stats">
            <div>
              <b>
                {automaticGrid.rows}×{Math.max(1, automaticGrid.cols)}
              </b>
              <span>lưới thi công</span>
            </div>
            <div>
              <b>{session.members.length}</b>
              <span>kỹ sư</span>
            </div>
            <div>
              <b>{totalQuestions}</b>
              <span>câu hỏi</span>
            </div>
          </div>

          <Button className="open-game" asChild>
            <Link href={playPath}>
              Vào phòng chơi này <ExternalLink size={16} />
            </Link>
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              void navigator.clipboard
                .writeText(`${window.location.origin}${playPath}`)
                .then(() => setStatus("Đã sao chép đường dẫn phòng chơi."))
            }
          >
            <Copy size={15} /> Sao chép link phòng
          </Button>
        </aside>

        <section className="admin-content">
          <section className="admin-section">
            <div className="admin-section-title">
              <span>01</span>
              <div>
                <h2>Thông tin công trình & Ảnh bí mật</h2>
                <p>Đặt tên phòng, người tạo và tải ảnh công trình bí mật (sẽ được ẩn giấu sau lưới thi công).</p>
              </div>
              <div className="auto-grid-badge">
                Lưới vuông <b>{automaticGrid.rows}×{automaticGrid.cols}</b>
              </div>
            </div>
            <div className="form-grid">
              <label>
                <span>Tên phiên chơi / phòng</span>
                <input
                  value={session.config.sessionName}
                  placeholder="Ví dụ: Thi đua Chi bộ 1…"
                  onChange={(event) => updateConfig("sessionName", event.target.value)}
                />
              </label>
              <label>
                <span>Tên người tạo / Chi bộ</span>
                <input
                  value={session.config.authorName}
                  placeholder="Ví dụ: Chi bộ Thanh niên…"
                  onChange={(event) => updateConfig("authorName", event.target.value)}
                />
              </label>
              <label className="building-answer">
                <span>Tên công trình bí mật</span>
                <input
                  value={session.config.buildingName}
                  placeholder="Ví dụ: Ngôi Nhà Đảng Vững Mạnh…"
                  onChange={(event) => updateConfig("buildingName", event.target.value)}
                />
              </label>
              <label className="full-field">
                <span>Thông điệp kết thúc chương trình</span>
                <textarea
                  value={session.config.quoteText}
                  placeholder="Nhập lời đúc kết hoặc danh ngôn ý nghĩa…"
                  onChange={(event) => updateConfig("quoteText", event.target.value)}
                />
              </label>
              <label className="upload-field">
                <Upload size={18} />
                <span>Tải ảnh công trình bí mật</span>
                <small>PNG, JPG hoặc SVG (Tự động đưa lên Supabase Cloud)</small>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleFile(event.target.files?.[0], "building")}
                />
              </label>
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-title">
              <span>02</span>
              <div>
                <h2>Kỹ sư thi công (1 Kỹ sư đại diện)</h2>
                <p>Tải ảnh chân dung rõ mặt để hiển thị kỹ sư đầu to trên công trường.</p>
              </div>
            </div>
            {session.members[0] && (
              <div className="admin-single-engineer">
                <label
                  className="avatar-upload-large"
                  style={{
                    backgroundImage: session.members[0].avatarUrl
                      ? `url("${session.members[0].avatarUrl}")`
                      : undefined,
                  }}
                >
                  {!session.members[0].avatarUrl && <ImagePlus size={24} />}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      void handleFile(event.target.files?.[0], "avatar", 0)
                    }
                  />
                </label>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#756b57" }}>
                    Tên kỹ sư:
                  </label>
                  <input
                    value={session.members[0].name}
                    placeholder="Tên kỹ sư đại diện…"
                    onChange={(event) =>
                      setSession((current) => ({
                        ...current,
                        members: [{ ...current.members[0], name: event.target.value }],
                      }))
                    }
                  />
                  <small style={{ color: "#8a7e6d", fontSize: "0.72rem" }}>
                    Đầu kỹ sư trên sân chơi được phóng to 64px để nhìn rõ khuôn mặt khi di chuyển và gõ búa.
                  </small>
                </div>
              </div>
            )}
          </section>

          <section className="admin-section">
            <div className="admin-section-title">
              <span>03</span>
              <div>
                <h2>Danh sách câu hỏi thi công & Lật tranh</h2>
                <p>Nhập câu hỏi để lật mở từng mảnh ghép của bức tranh bí mật (tối thiểu 4 câu hỏi chính để tạo lưới vuông).</p>
              </div>
              <div className="auto-grid-badge">
                Lưới vuông <b>{automaticGrid.rows}×{automaticGrid.cols}</b> ({allMainQuestions.length} câu chính)
              </div>
            </div>

            {/* Khối câu hỏi chính */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#173b32", fontWeight: 800 }}>
                    1. Câu hỏi chính (Mở các mảnh ghép bức tranh)
                  </h3>
                  <small style={{ color: "#748079" }}>
                    Mỗi câu hỏi chính tương ứng với 1 ô trên lưới thi công (Hiện có: {allMainQuestions.length} câu).
                  </small>
                </div>
                <Button variant="outline" onClick={() => addQuestion(false)} style={{ borderColor: "#caa84e", color: "#173b32", fontWeight: 700 }}>
                  <Plus size={15} /> Thêm câu hỏi chính
                </Button>
              </div>

              {allMainQuestions.length === 0 ? (
                <div
                  style={{
                    padding: "36px 16px",
                    textAlign: "center",
                    background: "#faf7ef",
                    borderRadius: 12,
                    border: "1.5px dashed #d9cdb4",
                    margin: "10px 0",
                  }}
                >
                  <HelpCircle size={28} style={{ margin: "0 auto 8px", color: "#a17f2b", opacity: 0.8 }} />
                  <p style={{ margin: "0 0 12px", color: "#5c5140", fontWeight: 600, fontSize: "0.88rem" }}>
                    Chưa có câu hỏi chính nào. Bạn cần tối thiểu 4 câu để tạo lưới vuông thi công!
                  </p>
                  <Button variant="outline" onClick={() => addQuestion(false)}>
                    <Plus size={15} /> Bấm vào đây để thêm câu hỏi đầu tiên
                  </Button>
                </div>
              ) : (
                allMainQuestions.map((question, questionIndex) => (
                  <div className="question-card" key={question.id}>
                    <div className="question-number">
                      {String(questionIndex + 1).padStart(2, "0")}
                    </div>
                    <div className="question-fields">
                      <div className="question-meta">
                        <select
                          value={question.type}
                          onChange={(event) =>
                            updateQuestion(question.id, {
                              type: event.target.value as Question["type"],
                              options:
                                event.target.value === "crossword"
                                  ? []
                                  : question.options.length
                                  ? question.options
                                  : ["A", "B", "C", "D"],
                            })
                          }
                        >
                          <option value="mcq">Trắc nghiệm (MCQ)</option>
                          <option value="crossword">Điền từ (Ô chữ)</option>
                        </select>
                        <span style={{ fontSize: "0.72rem", color: "#166534", fontWeight: 700, background: "#dcfce7", padding: "3px 8px", borderRadius: 6 }}>
                          Ô mảnh ghép #{questionIndex + 1}
                        </span>
                      </div>
                      <input
                        value={question.question}
                        placeholder="Nhập nội dung câu hỏi…"
                        onChange={(event) =>
                          updateQuestion(question.id, {
                            question: event.target.value,
                          })
                        }
                      />
                      {question.type === "mcq" && (
                        <div className="option-editor">
                          {question.options.map((option, optionIndex) => (
                            <input
                              key={optionIndex}
                              value={option}
                              placeholder={`Lựa chọn ${String.fromCharCode(65 + optionIndex)}…`}
                              onChange={(event) =>
                                updateQuestion(question.id, {
                                  options: question.options.map((item, index) =>
                                    index === optionIndex ? event.target.value : item
                                  ),
                                })
                              }
                            />
                          ))}
                        </div>
                      )}
                      <label className="answer-field">
                        <span>Đáp án đúng</span>
                        <input
                          value={question.answer}
                          placeholder="Nhập đáp án đúng chính xác…"
                          onChange={(event) =>
                            updateQuestion(question.id, {
                              answer: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="delete-question"
                      aria-label="Xóa câu hỏi"
                      onClick={() => removeQuestion(question.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Khối câu hỏi dự bị */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "2px dashed #ded4c2" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#854d0e", fontWeight: 800 }}>
                    2. Kho câu hỏi dự bị (Dùng khi người chơi trả lời sai)
                  </h3>
                  <small style={{ color: "#748079" }}>
                    Khi trả lời sai một ô, câu hỏi dự bị sẽ tự động được bốc cho lần thử tiếp theo (Hiện có: {allBackupQuestions.length} câu).
                  </small>
                </div>
                <Button variant="outline" onClick={() => addQuestion(true)} style={{ borderColor: "#d97706", color: "#854d0e", fontWeight: 700 }}>
                  <Plus size={15} /> Thêm câu dự bị
                </Button>
              </div>

              {allBackupQuestions.length === 0 ? (
                <div
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    background: "#fffbf2",
                    borderRadius: 12,
                    border: "1px dashed #e4caa0",
                    margin: "10px 0",
                  }}
                >
                  <p style={{ margin: "0 0 10px", color: "#854d0e", fontSize: "0.82rem" }}>
                    Chưa có câu hỏi dự bị. Nếu không có câu dự bị, hệ thống sẽ dùng lại câu hỏi chính khi người chơi bấm lại vào ô đó.
                  </p>
                  <Button variant="ghost" onClick={() => addQuestion(true)} style={{ color: "#b45309" }}>
                    <Plus size={14} /> Thêm câu hỏi dự bị
                  </Button>
                </div>
              ) : (
                allBackupQuestions.map((question, questionIndex) => (
                  <div className="question-card" key={question.id} style={{ background: "#fffdf9" }}>
                    <div className="question-number" style={{ background: "#fef3c7", color: "#b45309" }}>
                      D{String(questionIndex + 1)}
                    </div>
                    <div className="question-fields">
                      <div className="question-meta">
                        <select
                          value={question.type}
                          onChange={(event) =>
                            updateQuestion(question.id, {
                              type: event.target.value as Question["type"],
                              options:
                                event.target.value === "crossword"
                                  ? []
                                  : question.options.length
                                  ? question.options
                                  : ["A", "B", "C", "D"],
                            })
                          }
                        >
                          <option value="mcq">Trắc nghiệm (MCQ)</option>
                          <option value="crossword">Điền từ (Ô chữ)</option>
                        </select>
                        <span style={{ fontSize: "0.72rem", color: "#b45309", fontWeight: 700, background: "#fef3c7", padding: "3px 8px", borderRadius: 6 }}>
                          Câu dự bị #{questionIndex + 1}
                        </span>
                      </div>
                      <input
                        value={question.question}
                        placeholder="Nhập nội dung câu hỏi dự bị…"
                        onChange={(event) =>
                          updateQuestion(question.id, {
                            question: event.target.value,
                          })
                        }
                      />
                      {question.type === "mcq" && (
                        <div className="option-editor">
                          {question.options.map((option, optionIndex) => (
                            <input
                              key={optionIndex}
                              value={option}
                              placeholder={`Lựa chọn ${String.fromCharCode(65 + optionIndex)}…`}
                              onChange={(event) =>
                                updateQuestion(question.id, {
                                  options: question.options.map((item, index) =>
                                    index === optionIndex ? event.target.value : item
                                  ),
                                })
                              }
                            />
                          ))}
                        </div>
                      )}
                      <label className="answer-field">
                        <span>Đáp án đúng</span>
                        <input
                          value={question.answer}
                          placeholder="Nhập đáp án đúng chính xác…"
                          onChange={(event) =>
                            updateQuestion(question.id, {
                              answer: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="delete-question"
                      aria-label="Xóa câu hỏi dự bị"
                      onClick={() => removeQuestion(question.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>
      </div>

      <footer className="admin-savebar">
        <div>
          {status ? (
            <>
              <Check size={16} /> {status}
            </>
          ) : (
            <>
              <Users size={16} /> Nhấn &quot;Lưu toàn bộ cấu hình&quot; để lưu phòng vào Supabase
            </>
          )}
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          <Save size={16} /> {saving ? "Đang lưu…" : "Lưu toàn bộ cấu hình"}
        </Button>
      </footer>
    </main>
  );
}
