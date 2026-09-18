export type QuestionType = "mcq" | "crossword";
export type CellState = "empty" | "built" | "failed";

export interface Question {
  id: string;
  type: QuestionType;
  question: string;
  options: string[];
  answer: string;
  isBackup?: boolean;
}

export interface StageConfig {
  stage: number;
  name: string;
  description: string;
  questions: Question[];
}

export interface TeamMember {
  id: string;
  sessionId: string;
  name: string;
  avatarUrl: string;
  color: string;
}

export interface GameConfig {
  sessionId: string;
  sessionName: string;
  buildingName: string;
  buildingImageUrl: string;
  gridRows: number;
  gridCols: number;
  quoteText: string;
  stagesData: StageConfig[];
}

export interface GridCellStatus {
  cellId: string;
  status: CellState;
  builtBy: string | null;
}

export interface GameState {
  sessionId: string;
  currentStage: number;
  gridStatus: GridCellStatus[];
  questionCursor: Record<string, number>;
  completed: boolean;
  updatedAt: string;
}

export interface GameSession {
  config: GameConfig;
  members: TeamMember[];
  state: GameState;
}
