import type { GameSession, GridCellStatus, StageConfig } from "./game-types";

export const OFFICIAL_SESSION_ID = "11111111-1111-4111-8111-111111111111";
export const OFFICIAL_IMAGE_URL = "/symbolic-party-house.jpg";
export const DEFAULT_BG_MUSIC_URL = "https://assets.mixkit.co/music/preview/mixkit-game-level-music-689.mp3";

export const COMMUNITY_PRESETS = [
  {
    sessionId: OFFICIAL_SESSION_ID,
    sessionName: "Ngôi Nhà Đảng Vững Mạnh",
    authorName: "Đảng ủy Khối / Chi bộ Tiên phong",
    buildingName: "Biểu tượng Ngôi Nhà Đảng Vững Mạnh",
    buildingImageUrl: OFFICIAL_IMAGE_URL,
    questionCount: 16,
    memberCount: 4,
    updatedAt: new Date().toISOString(),
  },
];

export const STAGE_TEMPLATES: StageConfig[] = [
  {
    stage: 1,
    name: "Móng",
    description: "Nền tảng tư tưởng Mác – Lênin & Tư tưởng Hồ Chí Minh",
    questions: [
      {
        id: "q1",
        type: "mcq",
        question: "Nền tảng tư tưởng, kim chỉ nam cho hành động của Đảng Cộng sản Việt Nam là gì?",
        options: [
          "Chủ nghĩa Mác – Lênin và Tư tưởng Hồ Chí Minh",
          "Kinh tế thị trường định hướng XHCN",
          "Hệ thống pháp luật hiện đại",
          "Truyền thống văn hóa dân tộc",
        ],
        answer: "Chủ nghĩa Mác – Lênin và Tư tưởng Hồ Chí Minh",
      },
      {
        id: "q2",
        type: "crossword",
        question: "Điền từ: Đảng Cộng sản Việt Nam là đội tiên phong của giai cấp _____ và nhân dân lao động.",
        options: [],
        answer: "công nhân",
      },
      {
        id: "q3",
        type: "mcq",
        question: "Tư tưởng Hồ Chí Minh là kết quả của sự vận dụng sáng tạo chủ nghĩa Mác – Lênin vào điều kiện cụ thể của nước nào?",
        options: ["Việt Nam", "Khu vực Đông Nam Á", "Các nước thuộc địa", "Phong trào công nhân quốc tế"],
        answer: "Việt Nam",
      },
      {
        id: "q4",
        type: "crossword",
        question: "Điền từ: Nền tảng vững thì công trình mới bền, gốc rễ sâu thì cây mới vững. Gốc của Đảng là ở lòng _____ .",
        options: [],
        answer: "dân",
      },
    ],
  },
  {
    stage: 2,
    name: "Cột",
    description: "Tổ chức, Kỷ cương & Bản lĩnh chính trị vững vàng",
    questions: [
      {
        id: "q5",
        type: "mcq",
        question: "Nguyên tắc tổ chức và hoạt động cơ bản, quan trọng nhất của Đảng là gì?",
        options: ["Tập trung dân chủ", "Tự do cá nhân tuyệt đối", "Phân quyền độc lập", "Đa nguyên chính trị"],
        answer: "Tập trung dân chủ",
      },
      {
        id: "q6",
        type: "crossword",
        question: "Điền từ: Sức mạnh của Đảng bắt nguồn từ sự thống nhất ý chí và _____ .",
        options: [],
        answer: "hành động",
      },
      {
        id: "q7",
        type: "mcq",
        question: "Phương châm tự phê bình và phê bình trong Đảng được Bác Hồ ví như việc làm cần thiết nào hàng ngày?",
        options: ["Rửa mặt mỗi ngày", "Soi gương trước khi ra ngoài", "Kiểm kê tài sản", "Đánh giá tiến độ"],
        answer: "Rửa mặt mỗi ngày",
      },
      {
        id: "q8",
        type: "crossword",
        question: "Điền từ: Kỷ luật của Đảng là kỷ luật tự giác, nghiêm minh và không có vùng _____ .",
        options: [],
        answer: "cấm",
      },
    ],
  },
  {
    stage: 3,
    name: "Tường",
    description: "Vách thành lòng dân & Gắn bó máu thịt với Nhân dân",
    questions: [
      {
        id: "q9",
        type: "mcq",
        question: "Mọi chủ trương, đường lối, chính sách của Đảng phải thực sự xuất phát từ đâu?",
        options: [
          "Nguyện vọng, quyền và lợi ích chính đáng của Nhân dân",
          "Kinh nghiệm của các nước phát triển",
          "Mong muốn chủ quan của người lãnh đạo",
          "Các lý thuyết kinh tế hiện đại",
        ],
        answer: "Nguyện vọng, quyền và lợi ích chính đáng của Nhân dân",
      },
      {
        id: "q10",
        type: "crossword",
        question: "Điền từ: Dân biết, dân bàn, dân làm, dân kiểm tra, dân giám sát, dân _____ .",
        options: [],
        answer: "thụ hưởng",
      },
      {
        id: "q11",
        type: "mcq",
        question: "Công tác nào được coi là chiếc cầu nối bền chặt nhất giữa Đảng với quần chúng nhân dân?",
        options: ["Công tác Dân vận", "Công tác Đối ngoại", "Công tác Hậu cần", "Công tác Hành chính"],
        answer: "Công tác Dân vận",
      },
      {
        id: "q12",
        type: "crossword",
        question: "Điền từ: Muốn dân tin, dân theo thì cán bộ, đảng viên phải nói đi đôi với _____ .",
        options: [],
        answer: "làm",
      },
    ],
  },
  {
    stage: 4,
    name: "Mái",
    description: "Đổi mới, Sáng tạo & Khát vọng Đất nước Hùng cường",
    questions: [
      {
        id: "q13",
        type: "mcq",
        question: "Mục tiêu tổng quát phấn đấu đến giữa thế kỷ XXI nước ta trở thành quốc gia như thế nào?",
        options: [
          "Nước phát triển, theo định hướng xã hội chủ nghĩa",
          "Nước công nghiệp quy mô trung bình",
          "Cường quốc kinh tế khu vực",
          "Quốc gia xuất khẩu hàng đầu thế giới",
        ],
        answer: "Nước phát triển, theo định hướng xã hội chủ nghĩa",
      },
      {
        id: "q14",
        type: "crossword",
        question: "Điền từ: Cán bộ phải dám nghĩ, dám nói, dám làm, dám chịu trách nhiệm vì lợi ích _____ .",
        options: [],
        answer: "chung",
      },
      {
        id: "q15",
        type: "mcq",
        question: "Yếu tố quyết định hàng đầu mọi thắng lợi của sự nghiệp cách mạng Việt Nam là gì?",
        options: [
          "Sự lãnh đạo đúng đắn của Đảng Cộng sản Việt Nam",
          "Sự giúp đỡ của các tổ chức quốc tế",
          "Liên minh kinh tế khu vực",
          "Sự bùng nổ của công nghệ",
        ],
        answer: "Sự lãnh đạo đúng đắn của Đảng Cộng sản Việt Nam",
      },
      {
        id: "q16",
        type: "crossword",
        question: "Điền từ hoàn thành mục tiêu: Xây dựng Đảng trong sạch, vững _____ .",
        options: [],
        answer: "mạnh",
      },
    ],
  },
];

export function calculateSquareGrid(count: number): { rows: number; cols: number } {
  const validCount = Math.max(4, count);
  const cols = Math.ceil(Math.sqrt(validCount));
  const rows = Math.ceil(validCount / cols);
  return { rows, cols };
}

export function getSquareGridFromStages(stages: StageConfig[]) {
  const mainQuestions = stages.flatMap((s) => s.questions).filter((q) => !q.isBackup);
  return calculateSquareGrid(mainQuestions.length);
}

export function getAutomaticGrid(stages: StageConfig[]) {
  return getSquareGridFromStages(stages);
}

export function createGridStatus(rows: number, cols: number): GridCellStatus[] {
  return Array.from({ length: rows * cols }, (_, index) => ({
    cellId: `${Math.floor(index / cols)}_${index % cols}`,
    status: "empty",
    builtBy: null,
    usedBackupIds: [],
  }));
}

export function createDemoSession(sessionId = OFFICIAL_SESSION_ID): GameSession {
  const squareGrid = getSquareGridFromStages(STAGE_TEMPLATES);
  return {
    config: {
      sessionId,
      sessionName: "Ngôi Nhà Đảng Vững Mạnh",
      authorName: "Đảng ủy Khối / Chi bộ Tiên phong",
      buildingName: "Biểu tượng Ngôi Nhà Đảng Vững Mạnh",
      buildingImageUrl: OFFICIAL_IMAGE_URL,
      gridRows: squareGrid.rows,
      gridCols: squareGrid.cols,
      quoteText: "Đoàn kết, đoàn kết, đại đoàn kết. Thành công, thành công, đại thành công! — Chủ tịch Hồ Chí Minh",
      stagesData: structuredClone(STAGE_TEMPLATES),
      bgMusicUrl: DEFAULT_BG_MUSIC_URL,
    },
    members: [
      { id: "11111111-0000-0000-0000-000000000001", sessionId, name: "Kỹ sư trưởng", avatarUrl: "", color: "#b91f2e" },
    ],
    state: {
      sessionId,
      currentStage: 1,
      gridStatus: createGridStatus(squareGrid.rows, squareGrid.cols),
      questionCursor: { "1": 0, "2": 0, "3": 0, "4": 0 },
      completed: false,
      bgMusicUrl: DEFAULT_BG_MUSIC_URL,
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Tính giai đoạn hoặc vị trí ô trên lưới thi công
 */
export function cellStage(index: number, totalCells: number, rows = 4, cols = 4): number {
  if (cols <= 0) return 1;
  const row = Math.floor(index / cols);
  const stage = rows - row;
  return Math.max(1, Math.min(4, stage));
}

