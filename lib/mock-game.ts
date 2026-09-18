import type { GameSession, GridCellStatus, StageConfig } from "./game-types";

export const STAGE_TEMPLATES: StageConfig[] = [
  {
    stage: 1,
    name: "Móng",
    description: "Nền tảng tư tưởng",
    questions: [
      { id: "q1", type: "mcq", question: "Nền tảng tư tưởng, kim chỉ nam cho hành động của Đảng là gì?", options: ["Chủ nghĩa Mác–Lênin, tư tưởng Hồ Chí Minh", "Pháp luật quốc tế", "Kinh tế thị trường", "Truyền thống địa phương"], answer: "Chủ nghĩa Mác–Lênin, tư tưởng Hồ Chí Minh" },
      { id: "q2", type: "crossword", question: "Điền từ: Đảng Cộng sản Việt Nam là đội tiên phong của giai cấp _____.", options: [], answer: "công nhân" },
      { id: "q3", type: "mcq", question: "Nguyên tắc tổ chức cơ bản của Đảng là gì?", options: ["Tập trung dân chủ", "Tự do tuyệt đối", "Phân quyền độc lập", "Đa nguyên"], answer: "Tập trung dân chủ", isBackup: true },
    ],
  },
  {
    stage: 2,
    name: "Cột",
    description: "Tổ chức và kỷ luật",
    questions: [
      { id: "q4", type: "mcq", question: "Sinh hoạt chi bộ thường kỳ được tổ chức theo nguyên tắc nào?", options: ["Đúng định kỳ, dân chủ, thiết thực", "Khi có yêu cầu", "Chỉ bằng văn bản", "Tùy từng cá nhân"], answer: "Đúng định kỳ, dân chủ, thiết thực" },
      { id: "q5", type: "crossword", question: "Điền từ: Sức mạnh của Đảng nằm ở sự _____.", options: [], answer: "đoàn kết" },
      { id: "q6", type: "mcq", question: "Điều gì giúp tổ chức luôn vững mạnh?", options: ["Kỷ luật và trách nhiệm", "Cạnh tranh nội bộ", "Giữ thông tin riêng", "Trì hoãn quyết định"], answer: "Kỷ luật và trách nhiệm", isBackup: true },
    ],
  },
  {
    stage: 3,
    name: "Tường",
    description: "Gắn bó với nhân dân",
    questions: [
      { id: "q7", type: "mcq", question: "Mọi hoạt động của Đảng cần xuất phát từ lợi ích của ai?", options: ["Nhân dân", "Một cá nhân", "Một đơn vị", "Một nhóm nhỏ"], answer: "Nhân dân" },
      { id: "q8", type: "crossword", question: "Điền từ: Dân biết, dân bàn, dân làm, dân kiểm tra, dân giám sát, dân _____.", options: [], answer: "thụ hưởng" },
      { id: "q9", type: "mcq", question: "Cách củng cố niềm tin của nhân dân tốt nhất là gì?", options: ["Nói đi đôi với làm", "Hứa thật nhiều", "Chỉ tuyên truyền", "Tránh phản biện"], answer: "Nói đi đôi với làm", isBackup: true },
    ],
  },
  {
    stage: 4,
    name: "Mái",
    description: "Đổi mới và phát triển",
    questions: [
      { id: "q10", type: "mcq", question: "Đổi mới trong công tác xây dựng Đảng cần gắn với điều gì?", options: ["Thực tiễn và hiệu quả", "Hình thức", "Thành tích ngắn hạn", "Sao chép máy móc"], answer: "Thực tiễn và hiệu quả" },
      { id: "q11", type: "crossword", question: "Điền từ: Xây dựng Đảng trong sạch, vững _____.", options: [], answer: "mạnh" },
      { id: "q12", type: "mcq", question: "Mục tiêu cuối cùng của công trình hôm nay là gì?", options: ["Đoàn kết – Kỷ cương – Đổi mới", "Cá nhân – Thành tích – Hình thức", "Nhanh – Nhiều – Riêng lẻ", "Ổn định – Khép kín – An toàn"], answer: "Đoàn kết – Kỷ cương – Đổi mới", isBackup: true },
    ],
  },
];

export function createGridStatus(rows: number, cols: number): GridCellStatus[] {
  return Array.from({ length: rows * cols }, (_, index) => ({
    cellId: `${Math.floor(index / cols)}_${index % cols}`,
    status: "empty",
    builtBy: null,
  }));
}

export function createDemoSession(sessionId = "demo-session"): GameSession {
  return {
    config: {
      sessionId,
      sessionName: "Chi bộ Tiên phong",
      buildingName: "Ngôi nhà đoàn kết",
      buildingImageUrl: "/demo-building.svg",
      gridRows: 4,
      gridCols: 5,
      quoteText: "Đoàn kết, đoàn kết, đại đoàn kết. Thành công, thành công, đại thành công!",
      stagesData: structuredClone(STAGE_TEMPLATES),
    },
    members: [
      { id: "m1", sessionId, name: "Minh Anh", avatarUrl: "", color: "#edb73b" },
      { id: "m2", sessionId, name: "Quang Huy", avatarUrl: "", color: "#65b88a" },
      { id: "m3", sessionId, name: "Thu Hà", avatarUrl: "", color: "#e87d66" },
      { id: "m4", sessionId, name: "Đức Long", avatarUrl: "", color: "#5f93ca" },
    ],
    state: {
      sessionId,
      currentStage: 1,
      gridStatus: createGridStatus(4, 5),
      questionCursor: { "1": 0, "2": 0, "3": 0, "4": 0 },
      completed: false,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function cellStage(index: number, totalCells: number) {
  return Math.min(4, Math.floor((index * 4) / totalCells) + 1);
}
