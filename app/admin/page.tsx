"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  Gamepad2,
  ImagePlus,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Users,
  Building2,
  HelpCircle,
  Music,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OFFICIAL_SESSION_ID,
  createDemoSession,
  createGridStatus,
  getAutomaticGrid,
} from "@/lib/mock-game";
import {
  applyMusicToAllRooms,
  isSupabaseConfigured,
  listPublicRooms,
  loadSession,
  resetGameState,
  saveSession,
  uploadAsset,
} from "@/lib/game-service";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GameSession, Question, RoomSummary } from "@/lib/game-types";
import { hasGameProgress } from "@/lib/game-types";
import {
  detectCsvDelimiter,
  getBackupsForParent,
  getMainQuestions,
  parseCsvRow,
  parseMultiSelectAnswers,
  stringifyMultiSelectAnswers,
} from "@/lib/question-answers";

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
  const [csvError, setCsvError] = useState("");
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [playChoiceOpen, setPlayChoiceOpen] = useState(false);
  const [isCheckingPlay, setIsCheckingPlay] = useState(false);
  const [isResettingPlay, setIsResettingPlay] = useState(false);

  // Download CSV template
  const downloadCsvTemplate = () => {
    const rows = [
      "type,question,option_a,option_b,option_c,option_d,answer,is_backup,parent_index",
      'mcq,"Đảng Cộng sản Việt Nam được thành lập năm nào?",1930,1945,1954,1975,1930,0,',
      'mcq,"Câu phụ cho câu 1 (lần thử 2)",1930,1941,1945,1954,1930,1,1',
      'multi_select,"Chọn các mốc lịch sử quan trọng",1930,1945,1954,1975,"1930|1945",0,',
      'true_false,"Việt Nam tuyên bố độc lập năm 1945 đúng không?",,,,,Đúng,0,',
      'crossword,"Ngày Quốc khánh Việt Nam",,,,,2 THÁNG 9,0,',
    ].join("\n");
    const blob = new Blob(["\uFEFF" + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mau-cau-hoi.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parse & import CSV
  const importCsvQuestions = (file: File) => {
    setCsvError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = ((e.target?.result as string) ?? "").replace(/^\uFEFF/, "");
        const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
        if (lines.length < 2) { setCsvError("File CSV trống hoặc không có dữ liệu."); return; }

        const delimiter = detectCsvDelimiter(lines[0]);
        const headers = parseCsvRow(lines[0], delimiter).map((h) => h.toLowerCase().trim());
        const typeIdx = headers.indexOf("type");
        const qIdx = headers.indexOf("question");
        const aIdx = headers.indexOf("option_a");
        const bIdx = headers.indexOf("option_b");
        const cIdx = headers.indexOf("option_c");
        const dIdx = headers.indexOf("option_d");
        const ansIdx = headers.indexOf("answer");
        const backupIdx = headers.indexOf("is_backup");
        const parentIdx = headers.indexOf("parent_index");

        if (typeIdx < 0 || qIdx < 0 || ansIdx < 0) {
          setCsvError("Định dạng CSV không đúng. Bản cần các cột: type, question, answer. Hãy tải file mẫu từ nút \"Tải mẫu CSV\".");
          return;
        }

        const imported: import("@/lib/game-types").Question[] = [];
        const importedParentIndex: number[] = [];
        const errors: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          const fields = parseCsvRow(lines[i], delimiter);
          if (fields.every((f) => !f)) continue;
          const type = (fields[typeIdx] ?? "").toLowerCase() as import("@/lib/game-types").QuestionType;
          const question = fields[qIdx] ?? "";
          const optA = fields[aIdx] ?? "";
          const optB = fields[bIdx] ?? "";
          const optC = fields[cIdx] ?? "";
          const optD = fields[dIdx] ?? "";
          const answer = fields[ansIdx] ?? "";
          const isBackup = String(fields[backupIdx] ?? "0").trim() === "1";
          const parentIndexRaw = parentIdx >= 0 ? Number(String(fields[parentIdx] ?? "").trim()) : NaN;

          if (!question) { errors.push(`Dòng ${i + 1}: Thiếu nội dung câu hỏi.`); continue; }
          if (!answer) { errors.push(`Dòng ${i + 1}: Thiếu đáp án.`); continue; }
          if (!["mcq", "multi_select", "true_false", "crossword"].includes(type)) {
            errors.push(`Dòng ${i + 1}: Loại câu hỏi "${type}" không hợp lệ.`); continue;
          }

          const options = [optA, optB, optC, optD].filter(Boolean);
          let normalizedAnswer = answer;
          if (type === "multi_select") {
            const matched = parseMultiSelectAnswers(answer, options);
            if (matched.length === 0) {
              errors.push(`Dòng ${i + 1}: Câu chọn nhiều đáp án chưa tick được đáp án nào. Dùng dấu ; trong cột answer, ví dụ 1930;1945, và phải trùng chữ với các lựa chọn.`);
              continue;
            }
            normalizedAnswer = stringifyMultiSelectAnswers(matched);
          } else if (type === "mcq" && options.length > 0) {
            const matchedOption = options.find((item) => item.trim() === answer.trim()) ?? options.find((item) => item.trim().toLocaleLowerCase("vi") === answer.trim().toLocaleLowerCase("vi"));
            if (matchedOption) normalizedAnswer = matchedOption;
          }

          if (isBackup && (!Number.isInteger(parentIndexRaw) || parentIndexRaw < 1)) {
            errors.push(`Dòng ${i + 1}: Câu phụ phải có parent_index (số thứ tự câu chính, bắt đầu từ 1).`);
            continue;
          }

          imported.push({
            id: crypto.randomUUID(),
            type,
            question,
            options: type === "true_false" ? ["\u0110úng", "Sai"] : type === "crossword" ? [] : options,
            answer: normalizedAnswer,
            isBackup,
          });
          importedParentIndex.push(isBackup ? parentIndexRaw : 0);
        }

        if (errors.length > 0) {
          setCsvError(errors.slice(0, 5).join(" | ") + (errors.length > 5 ? ` ... và ${errors.length - 5} lỗi khác.` : ""));
        }

        if (imported.length === 0) { setCsvError((csvError ? csvError + " | " : "") + "Không import được câu hỏi nào."); return; }

        setSession((current) => {
          const existingMains = getMainQuestions(current.config.stagesData.flatMap((s) => s.questions));
          const importedMains = imported.filter((q) => !q.isBackup);
          const mainLookup = [...existingMains, ...importedMains];
          const resolved = imported.map((q, index) => {
            if (!q.isBackup) return q;
            const parent = mainLookup[importedParentIndex[index] - 1];
            return parent ? { ...q, parentQuestionId: parent.id } : q;
          });
          const dangling = resolved.filter((q) => q.isBackup && !q.parentQuestionId).length;
          if (dangling > 0) {
            queueMicrotask(() => {
              setCsvError((prev) => (prev ? `${prev} | ` : "") + `${dangling} câu phụ chưa gắn được câu chính (kiểm tra parent_index).`);
            });
          }
          return {
            ...current,
            config: {
              ...current.config,
              stagesData: current.config.stagesData.map((s, idx) =>
                idx === 0 ? { ...s, questions: [...s.questions, ...resolved] } : s
              ),
            },
          };
        });
        setStatus(`✅ Đã import thành công ${imported.length} câu hỏi từ CSV!`);
      } catch {
        setCsvError("Lỗi phân tích file CSV. Kiểm tra lại định dạng file.");
      }
    };
    reader.readAsText(file, "utf-8");
  };

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

  const addQuestion = (isBackup = false, parentQuestionId?: string) => {
    const newQ: Question = {
      id: crypto.randomUUID(),
      type: "mcq",
      question: "",
      options: ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Lựa chọn D"],
      answer: "Lựa chọn A",
      isBackup,
      parentQuestionId: isBackup ? parentQuestionId : undefined,
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
          questions: stage.questions.filter(
            (q) => q.id !== questionId && q.parentQuestionId !== questionId
          ),
        })),
      },
    }));
  };

  const handleFile = async (
    file: File | undefined,
    kind: "building" | "avatar" | "audio",
    memberIndex?: number
  ) => {
    if (!file) return;
    setStatus("Đang tải tệp lên Supabase Storage…");
    try {
      const url = await uploadAsset(file, session.config.sessionId, kind);
      if (kind === "building") updateConfig("buildingImageUrl", url);
      else if (kind === "audio") {
        updateConfig("bgMusicUrl", url);
        setSession((current) => ({
          ...current,
          state: { ...current.state, bgMusicUrl: url },
        }));
      } else if (memberIndex !== undefined)
        setSession((current) => ({
          ...current,
          members: current.members.map((member, index) =>
            index === memberIndex ? { ...member, avatarUrl: url } : member
          ),
        }));
      setStatus("Đã cập nhật tệp thành công lên Supabase Cloud.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể tải tệp");
    }
  };

  const handleApplyMusicToAll = async () => {
    const music = session.config.bgMusicUrl || session.state.bgMusicUrl;
    if (!music) {
      setStatus("❌ Chưa có đường dẫn nhạc nền để áp dụng!");
      return;
    }
    setStatus("Đang đồng bộ nhạc nền này cho tất cả phòng trên Supabase…");
    try {
      await applyMusicToAllRooms(music);
      setStatus("✅ Đã áp dụng bộ nhạc nền này cho TẤT CẢ các phòng chơi thành công!");
    } catch (err) {
      setStatus("Không thể đồng bộ nhạc: " + (err instanceof Error ? err.message : String(err)));
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

    const allToValidate = session.config.stagesData.flatMap((s) => s.questions);
    const multiWithoutTick = allToValidate.find(
      (q) => q.type === "multi_select" && parseMultiSelectAnswers(q.answer, q.options).length === 0
    );
    if (multiWithoutTick) {
      setStatus("❌ Câu chọn nhiều đáp án phải tick ít nhất một ô đúng. Không để đáp án dạng chữ mà không khớp lựa chọn.");
      return;
    }

    const normalizedStages = session.config.stagesData.map((stage) => ({
      ...stage,
      questions: stage.questions.map((q) => {
        if (q.type !== "multi_select") return q;
        return {
          ...q,
          answer: stringifyMultiSelectAnswers(parseMultiSelectAnswers(q.answer, q.options)),
        };
      }),
    }));

    setSaving(true);
    setStatus("Đang lưu cấu hình vào Supabase…");
    const { rows, cols } = getAutomaticGrid(normalizedStages);
    const next: GameSession = {
      ...session,
      config: { ...session.config, stagesData: normalizedStages, gridRows: rows, gridCols: cols },
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

  const handleEnterPlay = async () => {
    setIsCheckingPlay(true);
    try {
      const loaded = await loadSession(session.config.sessionId);
      if (!hasGameProgress(loaded.state)) {
        window.location.href = playPath;
        return;
      }
      setPlayChoiceOpen(true);
    } catch {
      window.location.href = playPath;
    } finally {
      setIsCheckingPlay(false);
    }
  };

  const handleContinuePlay = () => {
    setPlayChoiceOpen(false);
    window.location.href = playPath;
  };

  const handleResetAndPlay = async () => {
    setIsResettingPlay(true);
    try {
      const loaded = await loadSession(session.config.sessionId);
      await resetGameState(loaded);
      setPlayChoiceOpen(false);
      window.location.href = playPath;
    } catch {
      window.location.href = playPath;
    } finally {
      setIsResettingPlay(false);
    }
  };
  const automaticGrid = getAutomaticGrid(session.config.stagesData);
  const allQuestions = session.config.stagesData.flatMap((stage) => stage.questions);
  const allMainQuestions = getMainQuestions(allQuestions);
  const unassignedBackups = allQuestions.filter((q) => q.isBackup && !q.parentQuestionId);
  const totalQuestions = allQuestions.length;

  const getMultiAnswers = (raw: string, options: string[] = []): string[] => {
    return parseMultiSelectAnswers(raw, options);
  };

  const renderQuestionEditor = (question: Question, questionIndex: number, isBackup: boolean, mainNumber?: number) => {
    const multiAnswers = getMultiAnswers(question.answer, question.options);

    return (
      <div className="question-card" key={question.id} style={isBackup ? { background: "#fffdf9" } : undefined}>
        <div className="question-number" style={isBackup ? { background: "#fef3c7", color: "#b45309" } : undefined}>
          {isBackup ? `D${String(questionIndex + 1)}` : String(questionIndex + 1).padStart(2, "0")}
        </div>
        <div className="question-fields">
          <div className="question-meta">
            <select
              value={question.type}
              onChange={(event) => {
                const nextType = event.target.value as Question["type"];
                let nextOptions = question.options;
                let nextAnswer = question.answer;
                if (nextType === "crossword") {
                  nextOptions = [];
                } else if (nextType === "true_false") {
                  nextOptions = ["Đúng", "Sai"];
                  if (nextAnswer !== "Đúng" && nextAnswer !== "Sai") nextAnswer = "Đúng";
                } else if (nextType === "mcq") {
                  if (nextOptions.length < 2) nextOptions = ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Lựa chọn D"];
                  if (nextAnswer === "Đúng" || nextAnswer === "Sai" || nextAnswer.startsWith("[")) {
                    nextAnswer = nextOptions[0] ?? "";
                  }
                } else if (nextType === "multi_select") {
                  if (nextOptions.length < 2) nextOptions = ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Lựa chọn D"];
                  if (!nextAnswer.startsWith("[")) {
                    nextAnswer = JSON.stringify([nextOptions[0] ?? ""]);
                  }
                }
                updateQuestion(question.id, {
                  type: nextType,
                  options: nextOptions,
                  answer: nextAnswer,
                });
              }}
            >
              <option value="mcq">Trắc nghiệm 1 đáp án (MCQ)</option>
              <option value="multi_select">Chọn nhiều đáp án (Hộp kiểm)</option>
              <option value="true_false">Đúng / Sai (2 nút)</option>
              <option value="crossword">Điền từ (Ô chữ)</option>
            </select>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                background: isBackup ? "#fef3c7" : "#dcfce7",
                color: isBackup ? "#b45309" : "#166534",
                padding: "3px 8px",
                borderRadius: 6,
              }}
            >
              {isBackup
                ? `Câu phụ ${mainNumber ?? "?"}.${questionIndex + 1}`
                : `Ô mảnh ghép #${questionIndex + 1}`}
            </span>
          </div>

          <textarea
            className="question-text-input"
            rows={2}
            value={question.question}
            placeholder={isBackup ? "Nhập nội dung câu hỏi phụ…" : "Nhập nội dung câu hỏi…"}
            onChange={(event) =>
              updateQuestion(question.id, {
                question: event.target.value,
              })
            }
          />

          {/* Dạng 1: Trắc nghiệm đơn MCQ */}
          {question.type === "mcq" && (
            <div className="option-editor-dynamic">
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: 6, fontWeight: 600 }}>
                Nhập các lựa chọn và bấm biểu tượng ✓ để chọn đáp án đúng:
              </div>
              <div className="options-list">
                {question.options.map((option, optIdx) => {
                  const isAnswer = question.answer === option && option !== "";
                  return (
                    <div key={optIdx} className="option-row">
                      <span className="option-letter">{String.fromCharCode(65 + optIdx)}</span>
                      <textarea
                        className="option-text-input"
                        rows={1}
                        value={option}
                        placeholder={`Lựa chọn ${String.fromCharCode(65 + optIdx)}…`}
                        onChange={(event) => {
                          const oldVal = option;
                          const newVal = event.target.value;
                          const nextOpts = question.options.map((item, index) =>
                            index === optIdx ? newVal : item
                          );
                          const nextAns = question.answer === oldVal ? newVal : question.answer;
                          updateQuestion(question.id, {
                            options: nextOpts,
                            answer: nextAns,
                          });
                        }}
                      />
                      <button
                        type="button"
                        className={`btn-check-answer ${isAnswer ? "is-active" : ""}`}
                        title={isAnswer ? "Đây là đáp án đúng" : "Bấm để chọn làm đáp án đúng"}
                        onClick={() => updateQuestion(question.id, { answer: option })}
                      >
                        <Check size={14} />
                      </button>
                      {question.options.length > 2 && (
                        <button
                          type="button"
                          className="btn-remove-option"
                          title="Xóa lựa chọn này"
                          onClick={() => {
                            const nextOpts = question.options.filter((_, idx) => idx !== optIdx);
                            const nextAns = question.answer === option ? (nextOpts[0] ?? "") : question.answer;
                            updateQuestion(question.id, {
                              options: nextOpts,
                              answer: nextAns,
                            });
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                {question.options.length < 8 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="btn-add-option"
                    onClick={() => {
                      const nextLetter = String.fromCharCode(65 + question.options.length);
                      updateQuestion(question.id, {
                        options: [...question.options, `Lựa chọn ${nextLetter}`],
                      });
                    }}
                  >
                    <Plus size={13} /> Thêm lựa chọn ({String.fromCharCode(65 + question.options.length)})
                  </Button>
                ) : <span />}
                <span style={{ fontSize: "0.76rem", color: "#166534", fontWeight: 700 }}>
                  Đáp án đúng: <u>{question.answer || "(Chưa chọn)"}</u>
                </span>
              </div>
            </div>
          )}

          {/* Dạng 2: Chọn nhiều đáp án Multi-select */}
          {question.type === "multi_select" && (
            <div className="option-editor-dynamic">
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: 6, fontWeight: 600 }}>
                Tick chọn các ô đáp án đúng bên dưới (có thể chọn 2, 3 hoặc nhiều đáp án đúng):
              </div>
              <div className="options-list">
                {question.options.map((option, optIdx) => {
                  const isChecked = multiAnswers.includes(option);
                  return (
                    <div key={optIdx} className="option-row">
                      <label className="checkbox-wrap" title="Đánh dấu đây là một đáp án đúng">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const current = getMultiAnswers(question.answer, question.options);
                            const next = e.target.checked
                              ? [...current, option]
                              : current.filter((item) => item !== option);
                            updateQuestion(question.id, { answer: stringifyMultiSelectAnswers(next) });
                          }}
                        />
                        <span className="option-letter">{String.fromCharCode(65 + optIdx)}</span>
                      </label>
                      <textarea
                        className="option-text-input"
                        rows={1}
                        value={option}
                        placeholder={`Lựa chọn ${String.fromCharCode(65 + optIdx)}…`}
                        onChange={(event) => {
                          const oldVal = option;
                          const newVal = event.target.value;
                          const nextOpts = question.options.map((item, index) =>
                            index === optIdx ? newVal : item
                          );
                          const currentSelected = getMultiAnswers(question.answer, question.options);
                          const nextSelected = currentSelected.map((item) => (item === oldVal ? newVal : item));
                          updateQuestion(question.id, {
                            options: nextOpts,
                            answer: stringifyMultiSelectAnswers(nextSelected),
                          });
                        }}
                      />
                      {question.options.length > 2 && (
                        <button
                          type="button"
                          className="btn-remove-option"
                          title="Xóa lựa chọn này"
                          onClick={() => {
                            const nextOpts = question.options.filter((_, idx) => idx !== optIdx);
                            const currentSelected = getMultiAnswers(question.answer, question.options);
                            const nextSelected = currentSelected.filter((item) => item !== option);
                            updateQuestion(question.id, {
                              options: nextOpts,
                              answer: stringifyMultiSelectAnswers(nextSelected),
                            });
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                {question.options.length < 8 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="btn-add-option"
                    onClick={() => {
                      const nextLetter = String.fromCharCode(65 + question.options.length);
                      updateQuestion(question.id, {
                        options: [...question.options, `Lựa chọn ${nextLetter}`],
                      });
                    }}
                  >
                    <Plus size={13} /> Thêm lựa chọn ({String.fromCharCode(65 + question.options.length)})
                  </Button>
                ) : <span />}
                <span style={{ fontSize: "0.76rem", color: "#2563eb", fontWeight: 700 }}>
                  Đã tick: <u>{multiAnswers.length > 0 ? multiAnswers.join(" ; ") : "(Chưa tick đáp án nào)"}</u>
                </span>
              </div>
            </div>
          )}

          {/* Dạng 3: Đúng / Sai True/False */}
          {question.type === "true_false" && (
            <div className="tf-editor-box">
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: 6, fontWeight: 600 }}>
                Chọn kết luận chính xác cho câu hỏi này:
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className={`btn-tf-pick is-true ${question.answer === "Đúng" ? "is-selected" : ""}`}
                  onClick={() => updateQuestion(question.id, { options: ["Đúng", "Sai"], answer: "Đúng" })}
                >
                  <Check size={16} /> Nhận định ĐÚNG
                </button>
                <button
                  type="button"
                  className={`btn-tf-pick is-false ${question.answer === "Sai" ? "is-selected" : ""}`}
                  onClick={() => updateQuestion(question.id, { options: ["Đúng", "Sai"], answer: "Sai" })}
                >
                  <X size={16} /> Nhận định SAI
                </button>
              </div>
            </div>
          )}

          {/* Dạng 4: Điền từ Crossword */}
          {question.type === "crossword" && (
            <label className="answer-field">
              <span>Đáp án ô chữ (từ hoặc cụm từ cần điền)</span>
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
          )}
        </div>
        <button
          className="delete-question"
          aria-label="Xóa câu hỏi"
          onClick={() => removeQuestion(question.id)}
        >
          <Trash2 size={16} />
        </button>
      </div>
    );
  };

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <a
          href="/"
          className="back-link"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = "/";
          }}
        >
          <ArrowLeft size={17} /> Về thư viện
        </a>
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

          <Button
            className="open-game"
            disabled={isCheckingPlay}
            onClick={() => void handleEnterPlay()}
          >
            {isCheckingPlay ? "Đang kiểm tra…" : "Vào phòng chơi này"} <ExternalLink size={16} />
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
              <div className="full-field" style={{ background: "#fbf8f2", padding: "14px 18px", borderRadius: 10, border: "1px solid #e7dcce" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#173b32", display: "flex", alignItems: "center", gap: 6 }}>
                    <Music size={16} style={{ color: "#7c3aed" }} /> Bộ âm thanh / Nhạc nền dùng chung (Lưu trên Supabase)
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    style={{ fontSize: "0.75rem", borderColor: "#7c3aed", color: "#6d28d9", fontWeight: 700 }}
                    onClick={() => void handleApplyMusicToAll()}
                    title="Đồng bộ bản nhạc này cho tất cả phòng có trong hệ thống"
                  >
                    Áp dụng nhạc này cho TẤT CẢ các phòng
                  </Button>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    style={{ flex: 1, minWidth: 240 }}
                    value={session.config.bgMusicUrl || session.state.bgMusicUrl || ""}
                    placeholder="URL file nhạc MP3/OGG hoặc bấm tải file bên cạnh…"
                    onChange={(e) => {
                      updateConfig("bgMusicUrl", e.target.value);
                      setSession((current) => ({
                        ...current,
                        state: { ...current.state, bgMusicUrl: e.target.value },
                      }));
                    }}
                  />
                  <label style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#f3e8ff", color: "#6b21a8", borderRadius: 8, fontSize: "0.8rem", fontWeight: 700 }}>
                    <Upload size={14} /> Tải file MP3 lên Supabase
                    <input
                      type="file"
                      accept="audio/*"
                      style={{ display: "none" }}
                      onChange={(e) => void handleFile(e.target.files?.[0], "audio")}
                    />
                  </label>
                </div>
                <small style={{ display: "block", marginTop: 6, color: "#78716c", fontSize: "0.74rem" }}>
                  Mọi tệp âm thanh tải lên sẽ được lưu trữ đám mây vĩnh viễn trên Supabase Storage (không bị mất khi làm mới trận hay chuyển thiết bị).
                </small>
              </div>
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
                <p>Mỗi câu chính là một ô. Câu phụ gắn ngay dưới câu đó: sai thì lấy ngẫu nhiên câu phụ còn lại; hết câu phụ thì khóa ô.</p>
              </div>
              <div className="auto-grid-badge">
                Lưới vuông <b>{automaticGrid.rows}×{automaticGrid.cols}</b> ({allMainQuestions.length} câu chính)
              </div>
            </div>

            {/* CSV Import Toolbar */}
            <div style={{
              display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10,
              padding: "12px 16px", background: "#f0f9f4", border: "1px solid #a7f3d0",
              borderRadius: 12, marginBottom: 20,
            }}>
              <FileUp size={18} style={{ color: "#059669", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, color: "#065f46", fontSize: "0.84rem" }}>
                  Import câu hỏi từ File CSV
                </span>
                <span style={{ color: "#6b7280", fontSize: "0.76rem", marginLeft: 8 }}>
                  Cột: type, question, option_a..d, answer, is_backup, parent_index. Câu phụ: is_backup=1 và parent_index = số thứ tự câu chính (1, 2, 3…). Câu chọn nhiều: answer viết 1930|1945.
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={downloadCsvTemplate}
                  style={{ borderColor: "#059669", color: "#065f46", fontSize: "0.78rem" }}
                >
                  <Download size={13} /> Tải mẫu CSV
                </Button>
                <Button
                  type="button" size="sm"
                  onClick={() => csvInputRef.current?.click()}
                  style={{ background: "#059669", color: "#fff", fontSize: "0.78rem" }}
                >
                  <FileUp size={13} /> Chọn file CSV để import
                </Button>
                <input
                  ref={csvInputRef} type="file" accept=".csv,text/csv"
                  style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsvQuestions(f); e.target.value = ""; }}
                />
              </div>
              {csvError && (
                <div style={{ width: "100%", padding: "6px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: "0.78rem", fontWeight: 600, wordBreak: "break-word" }}>
                  ⚠️ {csvError}
                </div>
              )}
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
                allMainQuestions.map((question, questionIndex) => {
                  const backups = getBackupsForParent(allQuestions, question.id);
                  return (
                    <div className="main-question-block" key={question.id}>
                      {renderQuestionEditor(question, questionIndex, false)}
                      <div className="backup-nest">
                        <div className="backup-nest-head">
                          <span>Câu hỏi phụ của ô #{questionIndex + 1} ({backups.length} câu)</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addQuestion(true, question.id)}
                            style={{ borderColor: "#d97706", color: "#854d0e", fontWeight: 700 }}
                          >
                            <Plus size={13} /> Thêm câu phụ
                          </Button>
                        </div>
                        {backups.length === 0 ? (
                          <p className="backup-nest-empty">
                            Chưa có câu phụ. Nếu trả lời sai ô này và không còn câu phụ thì ô sẽ bị khóa hẳn.
                          </p>
                        ) : (
                          backups.map((backup, backupIndex) =>
                            renderQuestionEditor(backup, backupIndex, true, questionIndex + 1)
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {unassignedBackups.length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "2px dashed #ded4c2" }}>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#854d0e", fontWeight: 800 }}>
                  Câu phụ chưa gắn câu chính ({unassignedBackups.length})
                </h3>
                <small style={{ color: "#748079" }}>
                  Các câu cũ trong kho chung. Hãy gắn vào đúng ô câu hỏi chính.
                </small>
              </div>
              {unassignedBackups.map((question, questionIndex) => (
                <div key={question.id}>
                  {renderQuestionEditor(question, questionIndex, true, 0)}
                  <label className="assign-backup-row">
                    <span>Gắn vào câu chính</span>
                    <select
                      value=""
                      onChange={(event) => {
                        const parentId = event.target.value;
                        if (parentId) updateQuestion(question.id, { parentQuestionId: parentId, isBackup: true });
                      }}
                    >
                      <option value="">Chọn ô câu hỏi chính…</option>
                      {allMainQuestions.map((main, index) => (
                        <option key={main.id} value={main.id}>
                          Ô #{index + 1}
                          {main.question ? `: ${main.question.slice(0, 60)}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
            )}
          </section>
        </section>
      </div>

      <Dialog open={playChoiceOpen} onOpenChange={setPlayChoiceOpen}>
        <DialogContent className="room-choice-dialog">
          <DialogHeader>
            <span className="dialog-kicker">TRẠNG THÁI TRẬN ĐẤU</span>
            <DialogTitle>{session.config.sessionName}</DialogTitle>
            <DialogDescription>
              Phòng này đã có tiến độ (ô đã mở, mở lỗi, hoặc đã đoán bức tranh). Bạn muốn chơi tiếp hay chơi lại từ đầu?
            </DialogDescription>
          </DialogHeader>
          <div className="room-choice-list">
            <Button className="play-choice" onClick={handleContinuePlay}>
              <span><Gamepad2 /></span>
              <div>
                <b>Tiếp tục thi công</b>
                <small>Giữ nguyên các ô đã lật và chơi tiếp</small>
              </div>
            </Button>
            <Button
              variant="outline"
              className="manage-choice"
              disabled={isResettingPlay}
              onClick={() => void handleResetAndPlay()}
            >
              <span><RotateCcw /></span>
              <div>
                <b>{isResettingPlay ? "Đang đặt lại…" : "Chơi lại từ đầu"}</b>
                <small>Xóa tiến độ và bắt đầu trận mới</small>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
