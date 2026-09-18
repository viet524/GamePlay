"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ExternalLink, ImagePlus, Plus, RotateCcw, Save, Trash2, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createDemoSession, createGridStatus } from "@/lib/mock-game";
import { isSupabaseConfigured, saveSession, uploadAsset } from "@/lib/game-service";
import type { GameSession, Question } from "@/lib/game-types";

const COLORS = ["#edb73b", "#65b88a", "#e87d66", "#5f93ca", "#a77bc4", "#d26b9d"];

function createAdminSession() {
  const sessionId = crypto.randomUUID();
  const draft = createDemoSession(sessionId);
  return { ...draft, members: draft.members.map((member) => ({ ...member, id: crypto.randomUUID(), sessionId })) };
}

export default function AdminPage() {
  const [session, setSession] = useState<GameSession>(() => createDemoSession("00000000-0000-4000-8000-000000000001"));
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSession(createAdminSession());
  }, []);

  const updateConfig = <K extends keyof GameSession["config"]>(key: K, value: GameSession["config"][K]) => {
    setSession((current) => ({ ...current, config: { ...current.config, [key]: value } }));
  };

  const updateQuestion = (stageIndex: number, questionIndex: number, patch: Partial<Question>) => {
    setSession((current) => ({
      ...current,
      config: {
        ...current.config,
        stagesData: current.config.stagesData.map((stage, sIndex) => sIndex === stageIndex ? {
          ...stage,
          questions: stage.questions.map((question, qIndex) => qIndex === questionIndex ? { ...question, ...patch } : question),
        } : stage),
      },
    }));
  };

  const addQuestion = (stageIndex: number) => {
    setSession((current) => ({
      ...current,
      config: {
        ...current.config,
        stagesData: current.config.stagesData.map((stage, index) => index === stageIndex ? {
          ...stage,
          questions: [...stage.questions, { id: crypto.randomUUID(), type: "mcq", question: "Câu hỏi mới", options: ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"], answer: "Đáp án A" }],
        } : stage),
      },
    }));
  };

  const removeQuestion = (stageIndex: number, questionIndex: number) => {
    setSession((current) => ({
      ...current,
      config: {
        ...current.config,
        stagesData: current.config.stagesData.map((stage, index) => index === stageIndex ? { ...stage, questions: stage.questions.filter((_, qIndex) => qIndex !== questionIndex) } : stage),
      },
    }));
  };

  const handleFile = async (file: File | undefined, kind: "building" | "avatar", memberIndex?: number) => {
    if (!file) return;
    setStatus("Đang tải ảnh…");
    try {
      const url = await uploadAsset(file, session.config.sessionId, kind);
      if (kind === "building") updateConfig("buildingImageUrl", url);
      else if (memberIndex !== undefined) setSession((current) => ({ ...current, members: current.members.map((member, index) => index === memberIndex ? { ...member, avatarUrl: url } : member) }));
      setStatus("Đã cập nhật ảnh.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể tải ảnh");
    }
  };

  const addMember = () => {
    setSession((current) => ({ ...current, members: [...current.members, { id: crypto.randomUUID(), sessionId: current.config.sessionId, name: `Thành viên ${current.members.length + 1}`, avatarUrl: "", color: COLORS[current.members.length % COLORS.length] }] }));
  };

  const save = async () => {
    setSaving(true);
    setStatus("Đang lưu cấu hình…");
    const rows = Math.max(2, Math.min(8, Number(session.config.gridRows)));
    const cols = Math.max(2, Math.min(10, Number(session.config.gridCols)));
    const next = {
      ...session,
      config: { ...session.config, gridRows: rows, gridCols: cols },
      state: session.state.gridStatus.length === rows * cols ? session.state : { ...session.state, gridStatus: createGridStatus(rows, cols), currentStage: 1, completed: false },
    };
    try {
      await saveSession(next);
      setSession(next);
      setStatus(`Đã lưu. ${isSupabaseConfigured() ? "Supabase đang hoạt động." : "Đang dùng chế độ demo cục bộ."}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể lưu cấu hình");
    } finally { setSaving(false); }
  };

  const newSession = () => {
    const fresh = createAdminSession();
    setSession(fresh);
    setStatus("Đã tạo mã phòng mới. Hãy chỉnh cấu hình và lưu.");
  };

  const playPath = `/play/${session.config.sessionId}`;

  return (
    <main className="admin-shell">
      <header className="admin-topbar"><Link href="/" className="back-link"><ArrowLeft size={17} /> Về công trường</Link><div><span>TRUNG TÂM ĐIỀU HÀNH</span><h1>Thiết lập phiên thi công</h1></div><div className={`connection-badge ${isSupabaseConfigured() ? "online" : "local"}`}><i /> {isSupabaseConfigured() ? "Supabase" : "Demo cục bộ"}</div></header>

      <div className="admin-layout">
        <aside className="admin-summary">
          <div className="summary-card"><span>MÃ PHÒNG</span><code>{session.config.sessionId.slice(0, 8).toUpperCase()}</code><Button variant="outline" onClick={newSession}><RotateCcw size={15} /> Tạo Session mới</Button></div>
          <div className="summary-preview" style={{ backgroundImage: `url("${session.config.buildingImageUrl}")` }}><span>XEM TRƯỚC CÔNG TRÌNH</span></div>
          <div className="summary-stats"><div><b>{session.config.gridRows}×{session.config.gridCols}</b><span>ô thi công</span></div><div><b>{session.members.length}</b><span>kỹ sư</span></div><div><b>{session.config.stagesData.reduce((sum, stage) => sum + stage.questions.length, 0)}</b><span>câu hỏi</span></div></div>
          <Button className="open-game" asChild><Link href={playPath}>Mở màn hình chơi <ExternalLink size={16} /></Link></Button>
          <Button variant="ghost" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}${playPath}`).then(() => setStatus("Đã sao chép đường dẫn phòng."))}><Copy size={15} /> Sao chép đường dẫn</Button>
        </aside>

        <section className="admin-content">
          <section className="admin-section"><div className="admin-section-title"><span>01</span><div><h2>Thông tin công trình</h2><p>Tên phòng, ảnh ghép và kích thước lưới trình chiếu.</p></div></div><div className="form-grid"><label><span>Tên phiên chơi</span><input value={session.config.sessionName} onChange={(event) => updateConfig("sessionName", event.target.value)} /></label><label><span>Đáp án tên công trình</span><input value={session.config.buildingName} onChange={(event) => updateConfig("buildingName", event.target.value)} /></label><label><span>Số hàng</span><input type="number" min="2" max="8" value={session.config.gridRows} onChange={(event) => updateConfig("gridRows", Number(event.target.value))} /></label><label><span>Số cột</span><input type="number" min="2" max="10" value={session.config.gridCols} onChange={(event) => updateConfig("gridCols", Number(event.target.value))} /></label><label className="full-field"><span>Câu chốt cuối chương trình</span><textarea value={session.config.quoteText} onChange={(event) => updateConfig("quoteText", event.target.value)} /></label><label className="upload-field"><Upload size={18} /><span>Tải ảnh công trình</span><small>PNG, JPG hoặc SVG</small><input type="file" accept="image/*" onChange={(event) => void handleFile(event.target.files?.[0], "building")} /></label></div></section>

          <section className="admin-section"><div className="admin-section-title"><span>02</span><div><h2>Đội kỹ sư</h2><p>Thêm tên và ảnh đại diện cho từng thành viên.</p></div><Button variant="outline" onClick={addMember}><Plus size={15} /> Thêm người</Button></div><div className="admin-members">{session.members.map((member, index) => <div className="admin-member" key={member.id}><label className="avatar-upload" style={{ "--avatar-color": member.color, backgroundImage: member.avatarUrl ? `url("${member.avatarUrl}")` : undefined } as React.CSSProperties}><ImagePlus size={17} /><input type="file" accept="image/*" onChange={(event) => void handleFile(event.target.files?.[0], "avatar", index)} /></label><input value={member.name} onChange={(event) => setSession((current) => ({ ...current, members: current.members.map((item, memberIndex) => memberIndex === index ? { ...item, name: event.target.value } : item) }))} /><button aria-label={`Xóa ${member.name}`} disabled={session.members.length <= 1} onClick={() => setSession((current) => ({ ...current, members: current.members.filter((_, memberIndex) => memberIndex !== index) }))}><Trash2 size={16} /></button></div>)}</div></section>

          <section className="admin-section"><div className="admin-section-title"><span>03</span><div><h2>Ngân hàng câu hỏi</h2><p>Quản lý câu hỏi chính và dự phòng theo bốn giai đoạn.</p></div></div><Tabs defaultValue="stage-1"><TabsList className="stage-tabs">{session.config.stagesData.map((stage) => <TabsTrigger key={stage.stage} value={`stage-${stage.stage}`}>{stage.stage}. {stage.name}<small>{stage.questions.length} câu</small></TabsTrigger>)}</TabsList>{session.config.stagesData.map((stage, stageIndex) => <TabsContent key={stage.stage} value={`stage-${stage.stage}`} className="question-editor"><div className="stage-editor-heading"><div><h3>{stage.name}</h3><p>{stage.description}</p></div><Button variant="outline" onClick={() => addQuestion(stageIndex)}><Plus size={15} /> Thêm câu hỏi</Button></div>{stage.questions.map((question, questionIndex) => <div className="question-card" key={question.id}><div className="question-number">{String(questionIndex + 1).padStart(2, "0")}</div><div className="question-fields"><div className="question-meta"><select value={question.type} onChange={(event) => updateQuestion(stageIndex, questionIndex, { type: event.target.value as Question["type"], options: event.target.value === "crossword" ? [] : question.options.length ? question.options : ["A", "B", "C", "D"] })}><option value="mcq">Trắc nghiệm</option><option value="crossword">Điền từ</option></select><label><input type="checkbox" checked={Boolean(question.isBackup)} onChange={(event) => updateQuestion(stageIndex, questionIndex, { isBackup: event.target.checked })} /> Câu dự phòng</label></div><input value={question.question} onChange={(event) => updateQuestion(stageIndex, questionIndex, { question: event.target.value })} />{question.type === "mcq" && <div className="option-editor">{question.options.map((option, optionIndex) => <input key={optionIndex} value={option} onChange={(event) => updateQuestion(stageIndex, questionIndex, { options: question.options.map((item, index) => index === optionIndex ? event.target.value : item) })} />)}</div>}<label className="answer-field"><span>Đáp án đúng</span><input value={question.answer} onChange={(event) => updateQuestion(stageIndex, questionIndex, { answer: event.target.value })} /></label></div><button className="delete-question" aria-label="Xóa câu hỏi" onClick={() => removeQuestion(stageIndex, questionIndex)}><Trash2 size={16} /></button></div>)}</TabsContent>)}</Tabs></section>
        </section>
      </div>

      <footer className="admin-savebar"><div>{status ? <><Check size={16} /> {status}</> : <><Users size={16} /> Mọi thay đổi chỉ có hiệu lực sau khi lưu</>}</div><Button onClick={() => void save()} disabled={saving}><Save size={16} /> {saving ? "Đang lưu…" : "Lưu toàn bộ cấu hình"}</Button></footer>
    </main>
  );
}
