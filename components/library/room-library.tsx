"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Gamepad2, Home, Library, Plus, RotateCcw, Search, Settings, Trash2, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMMUNITY_PRESETS, createGridStatus } from "@/lib/mock-game";
import { deleteRoom, listPublicRooms, loadSession, resetGameState, saveSession, uploadAsset } from "@/lib/game-service";
import type { GameSession, RoomSummary } from "@/lib/game-types";

export function RoomLibrary() {
  const [rooms, setRooms] = useState<RoomSummary[]>(COMMUNITY_PRESETS);
  const [query, setQuery] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<RoomSummary | null>(null);

  // Popup xóa phòng
  const [roomToDelete, setRoomToDelete] = useState<RoomSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Popup lựa chọn Chơi mới vs Tiếp tục
  const [playChoiceRoom, setPlayChoiceRoom] = useState<RoomSummary | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Popup tạo phòng mới
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formSessionName, setFormSessionName] = useState("");
  const [formAuthorName, setFormAuthorName] = useState("");
  const [formBuildingName, setFormBuildingName] = useState("");
  const [formQuoteText, setFormQuoteText] = useState("");
  const [formBuildingImage, setFormBuildingImage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const refreshRooms = async () => {
    try {
      const loaded = await listPublicRooms();
      if (loaded.length > 0) {
        setRooms(loaded);
      } else {
        setRooms(COMMUNITY_PRESETS);
      }
    } catch {
      setRooms(COMMUNITY_PRESETS);
    }
  };

  useEffect(() => {
    void refreshRooms();
  }, []);

  const filteredRooms = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return normalized
      ? rooms.filter((room) =>
          `${room.sessionName} ${room.authorName}`.toLocaleLowerCase("vi").includes(normalized)
        )
      : rooms;
  }, [query, rooms]);

  const handleOpenCreateModal = () => {
    setFormSessionName("");
    setFormAuthorName("");
    setFormBuildingName("");
    setFormQuoteText("");
    setFormBuildingImage("");
    setCreateError("");
    setIsCreateOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!roomToDelete) return;
    setIsDeleting(true);
    try {
      await deleteRoom(roomToDelete.sessionId);
      setRoomToDelete(null);
      await refreshRooms();
    } catch {
      /* ignore */
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartPlay = (room: RoomSummary) => {
    setSelectedRoom(null);
    setPlayChoiceRoom(room);
  };

  const handleContinuePlay = () => {
    if (!playChoiceRoom) return;
    const sid = playChoiceRoom.sessionId;
    setPlayChoiceRoom(null);
    window.location.href = `/play/${sid}`;
  };

  const handleResetAndPlay = async () => {
    if (!playChoiceRoom) return;
    setIsResetting(true);
    try {
      const session = await loadSession(playChoiceRoom.sessionId);
      await resetGameState(session);
      const sid = playChoiceRoom.sessionId;
      setPlayChoiceRoom(null);
      window.location.href = `/play/${sid}`;
    } catch {
      window.location.href = `/play/${playChoiceRoom.sessionId}`;
    } finally {
      setIsResetting(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSessionName.trim()) {
      setCreateError("Vui lòng nhập tên phiên chơi / phòng!");
      return;
    }
    if (!formAuthorName.trim()) {
      setCreateError("Vui lòng nhập tên người tạo / Chi bộ!");
      return;
    }
    if (!formBuildingName.trim()) {
      setCreateError("Vui lòng nhập tên công trình bí mật!");
      return;
    }

    setIsCreating(true);
    setCreateError("");

    try {
      const newSessionId = crypto.randomUUID();
      const newSession: GameSession = {
        config: {
          sessionId: newSessionId,
          sessionName: formSessionName.trim(),
          authorName: formAuthorName.trim(),
          buildingName: formBuildingName.trim(),
          buildingImageUrl: formBuildingImage || "/symbolic-party-house.jpg",
          gridRows: 2,
          gridCols: 2,
          quoteText: formQuoteText.trim() || "Đoàn kết, kỷ cương, đổi mới, phát triển!",
          stagesData: [
            { stage: 1, name: "Bộ câu hỏi thi công", description: "Lật mở bức tranh bí mật", questions: [] },
          ],
        },
        members: [
          {
            id: crypto.randomUUID(),
            sessionId: newSessionId,
            name: "Kỹ sư trưởng",
            avatarUrl: "",
            color: "#b91f2e",
          },
        ],
        state: {
          sessionId: newSessionId,
          currentStage: 1,
          gridStatus: createGridStatus(2, 2),
          questionCursor: { "1": 0, "2": 0, "3": 0, "4": 0 },
          completed: false,
          updatedAt: new Date().toISOString(),
        },
      };

      await saveSession(newSession);

      setIsCreateOpen(false);
      window.location.href = `/admin?session=${newSessionId}`;
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Có lỗi khi tạo phòng. Vui lòng thử lại!");
      setIsCreating(false);
    }
  };

  return (
    <main className="library-shell">
      <header className="library-header">
        <Link href="/" className="library-brand">
          <span><Library size={21} /></span>
          <div>
            <b>THƯ VIỆN PHÒNG CHƠI</b>
            <small>Xây Ngôi Nhà Đảng Vững Mạnh</small>
          </div>
        </Link>
        <Button onClick={handleOpenCreateModal} style={{ background: "#b91f2e", color: "#fff", fontWeight: 700 }}>
          <Plus size={17} /> Tạo phòng mới
        </Button>
      </header>

      <section className="library-intro">
        <div>
          <p>KHÁM PHÁ & CÙNG THI ĐUA</p>
          <h1>Chọn một phòng để bắt đầu</h1>
          <span>Các bộ câu hỏi và bức tranh sự kiện lịch sử bí mật đang chờ bạn khám phá. Hãy thi công để dần lật mở bức tranh hoàn thiện!</span>
        </div>
        <label className="room-search">
          <Search size={19} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên phòng hoặc người tạo…"
          />
        </label>
      </section>

      <section className="room-collection">
        <div className="collection-heading">
          <div>
            <BookOpen size={18} />
            <span>PHÒNG THI CÔNG</span>
          </div>
          <b>{filteredRooms.length} phòng</b>
        </div>
        {filteredRooms.length ? (
          <div className="room-grid">
            {filteredRooms.map((room, index) => (
              <div className="room-card-wrapper" key={room.sessionId}>
                <button className="room-card" onClick={() => setSelectedRoom(room)}>
                  <div className="room-cover" style={{ backgroundImage: `url("/construction-cover.jpg")` }}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <i>Bản vẽ bí mật</i>
                  </div>
                  <div className="room-card-body">
                    <small>CÔNG TRÌNH BÍ MẬT</small>
                    <h2>{room.sessionName}</h2>
                    <p>Tạo bởi {room.authorName}</p>
                    <div>
                      <span><BookOpen size={14} /> {room.questionCount} câu hỏi</span>
                      <span><Users size={14} /> 1 kỹ sư</span>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className="card-quick-delete"
                  title="Xóa phòng này"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRoomToDelete(room);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-library">
            <Search />
            <h2>Không tìm thấy phòng phù hợp</h2>
            <p>Thử một từ khóa khác hoặc tạo bộ câu hỏi của riêng bạn.</p>
          </div>
        )}
      </section>

      {/* Popup Lựa chọn Chơi hay Quản lý phòng đã có */}
      <Dialog open={Boolean(selectedRoom)} onOpenChange={(open) => !open && setSelectedRoom(null)}>
        <DialogContent className="room-choice-dialog">
          <DialogHeader>
            <span className="dialog-kicker">PHÒNG ĐÃ CHỌN</span>
            <DialogTitle>{selectedRoom?.sessionName}</DialogTitle>
            <DialogDescription>Chọn cách bạn muốn sử dụng phòng này.</DialogDescription>
          </DialogHeader>
          <div className="room-choice-list">
            <Button className="play-choice" onClick={() => selectedRoom && handleStartPlay(selectedRoom)}>
              <span><Gamepad2 /></span>
              <div>
                <b>Chơi game</b>
                <small>Mở màn hình thi công lật mở bức tranh</small>
              </div>
            </Button>
            <Button
              variant="outline"
              className="manage-choice"
              onClick={() => {
                if (selectedRoom) window.location.href = `/admin?session=${selectedRoom.sessionId}`;
              }}
            >
              <span><Settings /></span>
              <div>
                <b>Quản lý phòng</b>
                <small>Chỉnh câu hỏi, tên công trình & thông điệp</small>
              </div>
            </Button>
          </div>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="ghost"
              style={{ color: "#b91f2e", fontSize: "0.78rem" }}
              onClick={() => {
                const target = selectedRoom;
                setSelectedRoom(null);
                setRoomToDelete(target);
              }}
            >
              <Trash2 size={14} style={{ marginRight: 6 }} /> Xóa phòng này
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup Lựa chọn: Tiếp tục chơi hay Chơi mới từ đầu */}
      <Dialog open={Boolean(playChoiceRoom)} onOpenChange={(open) => !open && setPlayChoiceRoom(null)}>
        <DialogContent className="room-choice-dialog">
          <DialogHeader>
            <span className="dialog-kicker">TRẠNG THÁI TRẬN ĐẤU</span>
            <DialogTitle>{playChoiceRoom?.sessionName}</DialogTitle>
            <DialogDescription>
              Bạn muốn tiếp tục trận thi công đang dang dở hay đặt lại từ đầu?
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
              disabled={isResetting}
              onClick={() => void handleResetAndPlay()}
            >
              <span><RotateCcw /></span>
              <div>
                <b>Chơi mới từ đầu (Reset)</b>
                <small>{isResetting ? "Đang đặt lại…" : "Khởi động lại toàn bộ ô chưa mở"}</small>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup Xác nhận Xóa phòng */}
      <Dialog open={Boolean(roomToDelete)} onOpenChange={(open) => !open && setRoomToDelete(null)}>
        <DialogContent className="room-choice-dialog" style={{ maxWidth: 440 }}>
          <DialogHeader>
            <span className="dialog-kicker" style={{ color: "#b91f2e" }}>XÁC NHẬN XÓA PHÒNG</span>
            <DialogTitle>Xóa phòng thi công này?</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa phòng <b>"{roomToDelete?.sessionName}"</b>? Dữ liệu cấu hình và tiến độ trên Supabase sẽ bị xóa vĩnh viễn.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <Button variant="outline" onClick={() => setRoomToDelete(null)}>
              Hủy bỏ
            </Button>
            <Button
              disabled={isDeleting}
              style={{ background: "#b91f2e", color: "#fff" }}
              onClick={() => void handleConfirmDelete()}
            >
              {isDeleting ? "Đang xóa…" : "Xác nhận xóa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup Tạo phòng thi công mới (4 thông tin cơ bản) */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="create-room-dialog">
          <DialogHeader>
            <span className="dialog-kicker">KHỞI TẠO CÔNG TRÌNH MỚI</span>
            <DialogTitle>Tạo phòng thi công</DialogTitle>
            <DialogDescription>
              Điền 4 thông tin cơ bản để tạo phòng. Hệ thống sẽ lưu ngay vào cơ sở dữ liệu và mở trang để bạn tự thêm câu hỏi.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateRoom} className="create-room-form">
            {createError && (
              <div className="create-error-alert">
                {createError}
              </div>
            )}

            <div className="create-form-fields">
              <label>
                <span>1. Tên phiên chơi / phòng (*)</span>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Hội thi Chi bộ 1 - Đợt sinh hoạt chính trị"
                  value={formSessionName}
                  onChange={(e) => setFormSessionName(e.target.value)}
                />
              </label>

              <label>
                <span>2. Tên người tạo / Chi bộ (*)</span>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Chi bộ Hành chính / Đ/c Nguyễn Văn A"
                  value={formAuthorName}
                  onChange={(e) => setFormAuthorName(e.target.value)}
                />
              </label>

              <label>
                <span>3. Tên công trình bí mật (*)</span>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Ngôi Nhà Đảng Vững Mạnh"
                  value={formBuildingName}
                  onChange={(e) => setFormBuildingName(e.target.value)}
                />
              </label>

              <label>
                <span>4. Thông điệp bế mạc / Ý nghĩa công trình</span>
                <textarea
                  rows={3}
                  placeholder="Ví dụ: Giữ gìn sự đoàn kết nhất trí của Đảng như giữ gìn con ngươi của mắt mình…"
                  value={formQuoteText}
                  onChange={(e) => setFormQuoteText(e.target.value)}
                />
              </label>

              <div className="create-image-box">
                <span className="create-image-label">Ảnh công trình bí mật (Ẩn giấu sau các ô thi công)</span>
                <div className="create-image-row">
                  <div
                    className="create-image-thumb"
                    style={{
                      backgroundImage: `url("${formBuildingImage || "/symbolic-party-house.jpg"}")`,
                    }}
                  />
                  <div className="create-image-meta">
                    <label className="upload-custom-btn">
                      <Upload size={14} /> Tải ảnh công trình riêng (Tùy chọn)
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const tempId = crypto.randomUUID();
                            const url = await uploadAsset(file, tempId, "building");
                            setFormBuildingImage(url);
                          } catch {
                            /* Fallback to default */
                          }
                        }}
                      />
                    </label>
                    <small>Mặc định là ảnh Biểu tượng Ngôi nhà Đảng (hoàn toàn khác với ảnh giàn giáo che bên ngoài).</small>
                  </div>
                </div>
              </div>
            </div>

            <div className="create-modal-actions">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={isCreating}
                style={{ background: "#b91f2e", color: "#fff", fontWeight: 700 }}
              >
                {isCreating ? "Đang lưu phòng…" : "Lưu & Bắt đầu soạn câu hỏi"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
