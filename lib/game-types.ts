export type QuestionType = "mcq" | "multi_select" | "true_false" | "crossword";
export type CellState = "empty" | "built" | "failed" | "locked";

export interface Question {
  id: string;
  type: QuestionType;
  question: string;
  options: string[];
  answer: string;
  isBackup?: boolean;
  parentQuestionId?: string;
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
  authorName: string;
  buildingName: string;
  buildingImageUrl: string;
  gridRows: number;
  gridCols: number;
  quoteText: string;
  stagesData: StageConfig[];
  bgMusicUrl?: string;
}

export interface RoomSummary {
  sessionId: string;
  sessionName: string;
  authorName: string;
  buildingImageUrl: string;
  questionCount: number;
  memberCount: number;
  updatedAt: string;
}

export interface GridCellStatus {
  cellId: string;
  status: CellState;
  builtBy: string | null;
  usedBackupIds?: string[];
}

export interface GameState {
  sessionId: string;
  currentStage: number;
  gridStatus: GridCellStatus[];
  questionCursor: Record<string, number>;
  completed: boolean;
  hasGuessedCorrectly?: boolean;
  guessedName?: string;
  bgMusicUrl?: string;
  updatedAt: string;
}

export interface GameSession {
  config: GameConfig;
  members: TeamMember[];
  state: GameState;
}

export function hasGameProgress(state: GameState | null | undefined): boolean {
  if (!state) return false;
  return (
    Boolean(state.completed) ||
    Boolean(state.hasGuessedCorrectly) ||
    Boolean(state.guessedName?.trim()) ||
    (state.gridStatus ?? []).some(
      (cell) => cell.status === "built" || cell.status === "failed" || cell.status === "locked"
    )
  );
}
