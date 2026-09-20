import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BG_MUSIC_URL, createDemoSession, createGridStatus, getAutomaticGrid } from "./mock-game";
import type { GameSession, GameState, RoomSummary, StageConfig } from "./game-types";

const LOCAL_PREFIX = "xay-nha-dang:";
const CHANNEL_NAME = "xay-nha-dang-sync";

function getSupabase(): SupabaseClient | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!rawUrl || !key) return null;
  const url = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  return createClient(url, key);
}

export const isSupabaseConfigured = () => Boolean(getSupabase());

function localKey(sessionId: string) {
  return `${LOCAL_PREFIX}${sessionId}`;
}

function readLocal(sessionId: string): GameSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(localKey(sessionId));
    return value ? JSON.parse(value) as GameSession : null;
  } catch {
    return null;
  }
}

function writeLocal(session: GameSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(localKey(session.config.sessionId), JSON.stringify(session));
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ sessionId: session.config.sessionId, state: session.state });
  channel.close();
}

function normalizeSessionGrid(session: GameSession): GameSession {
  const { rows, cols } = getAutomaticGrid(session.config.stagesData);
  if (session.config.gridRows === rows && session.config.gridCols === cols && session.state.gridStatus.length === rows * cols) return session;
  const oldCols = Math.max(1, session.config.gridCols);
  const oldGrid = session.state.gridStatus;
  const nextGrid = createGridStatus(rows, cols).map((cell, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const source = oldGrid[row * oldCols + col];
    return source ? { ...source, cellId: cell.cellId } : cell;
  });
  return {
    ...session,
    config: { ...session.config, gridRows: rows, gridCols: cols },
    state: { ...session.state, gridStatus: nextGrid, completed: nextGrid.every((cell) => cell.status === "built") },
  };
}

export async function loadSession(sessionId: string): Promise<GameSession> {
  const supabase = getSupabase();
  if (!supabase) return normalizeSessionGrid(readLocal(sessionId) ?? createDemoSession(sessionId));

  const [{ data: config }, { data: members }, { data: state }] = await Promise.all([
    supabase.from("GameConfig").select("*").eq("session_id", sessionId).maybeSingle(),
    supabase.from("TeamMembers").select("*").eq("session_id", sessionId).order("created_at"),
    supabase.from("GameState").select("*").eq("session_id", sessionId).maybeSingle(),
  ]);

  if (!config) return normalizeSessionGrid(readLocal(sessionId) ?? createDemoSession(sessionId));
  const rows = Number(config.grid_rows);
  const cols = Number(config.grid_cols);
  const stages = (config.stages_data ?? []) as StageConfig[];
  const configObj = config as Record<string, unknown>;
  const configMusic = (configObj.bg_music_url as string | undefined)
    ?? (stages[0] as unknown as { bgMusicUrl?: string })?.bgMusicUrl
    ?? DEFAULT_BG_MUSIC_URL;
  const effectiveMusic = (state?.bg_music_url as string | undefined) ?? configMusic;

  return normalizeSessionGrid({
    config: {
      sessionId,
      sessionName: config.session_name ?? "Phòng thi công",
      authorName: config.author_name ?? "Người dùng cộng đồng",
      buildingName: config.building_name ?? "Biểu tượng Ngôi Nhà Đảng Vững Mạnh",
      buildingImageUrl: config.building_image_url || "/symbolic-party-house.jpg",
      gridRows: rows,
      gridCols: cols,
      quoteText: config.quote_text,
      stagesData: stages,
      bgMusicUrl: configMusic,
    },
    members: (members ?? []).map((member) => ({
      id: member.id,
      sessionId,
      name: member.name,
      avatarUrl: member.avatar_url ?? "",
      color: member.color ?? "#edb73b",
    })),
    state: state ? {
      sessionId,
      currentStage: state.current_stage,
      gridStatus: state.grid_status,
      questionCursor: state.question_cursor ?? { "1": 0, "2": 0, "3": 0, "4": 0 },
      completed: Boolean(state.completed),
      hasGuessedCorrectly: Boolean(state.has_guessed_correctly),
      guessedName: state.guessed_name ?? undefined,
      bgMusicUrl: effectiveMusic,
      updatedAt: state.updated_at,
    } : {
      sessionId,
      currentStage: 1,
      gridStatus: createGridStatus(rows, cols),
      questionCursor: { "1": 0, "2": 0, "3": 0, "4": 0 },
      completed: false,
      hasGuessedCorrectly: false,
      guessedName: undefined,
      bgMusicUrl: effectiveMusic,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function saveSession(session: GameSession): Promise<void> {
  if (session.config.stagesData.length > 0 && session.config.bgMusicUrl) {
    (session.config.stagesData[0] as unknown as { bgMusicUrl?: string }).bgMusicUrl = session.config.bgMusicUrl;
  }
  writeLocal(session);
  const supabase = getSupabase();
  if (!supabase) return;

  const { error: configError } = await supabase.from("GameConfig").upsert({
    session_id: session.config.sessionId,
    session_name: session.config.sessionName,
    author_name: session.config.authorName,
    is_public: true,
    building_name: session.config.buildingName,
    building_image_url: session.config.buildingImageUrl,
    grid_rows: session.config.gridRows,
    grid_cols: session.config.gridCols,
    quote_text: session.config.quoteText,
    stages_data: session.config.stagesData,
  });
  if (configError) throw configError;

  await supabase.from("TeamMembers").delete().eq("session_id", session.config.sessionId);
  if (session.members.length) {
    const { error: membersError } = await supabase.from("TeamMembers").insert(session.members.map((member) => ({
      id: member.id,
      session_id: session.config.sessionId,
      name: member.name,
      avatar_url: member.avatarUrl,
      color: member.color,
    })));
    if (membersError) throw membersError;
  }
  await saveGameState(session.state);
}

export async function listPublicRooms(): Promise<RoomSummary[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const [{ data, error }, { data: memberRows }] = await Promise.all([
        supabase
          .from("GameConfig")
          .select("session_id,session_name,author_name,building_image_url,stages_data,updated_at")
          .eq("is_public", true)
          .order("updated_at", { ascending: false }),
        supabase.from("TeamMembers").select("session_id"),
      ]);

      if (!error && data && data.length > 0) {
        // Dọn dẹp các bản nháp local cũ nếu có
        if (typeof window !== "undefined") {
          const keysToRemove: string[] = [];
          for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(LOCAL_PREFIX) && key.includes("00000000-0000-4000-8000")) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach((k) => localStorage.removeItem(k));
        }

        return data.map((room) => ({
          sessionId: String(room.session_id),
          sessionName: String(room.session_name ?? "Phòng cộng đồng"),
          authorName: String(room.author_name ?? "Người dùng cộng đồng"),
          buildingImageUrl: String(room.building_image_url || "/symbolic-party-house.jpg"),
          questionCount: ((room.stages_data ?? []) as GameSession["config"]["stagesData"]).reduce(
            (sum, stage) => sum + stage.questions.filter((question) => !question.isBackup).length,
            0
          ),
          memberCount: (memberRows ?? []).filter((member) => member.session_id === room.session_id).length,
          updatedAt: String(room.updated_at ?? new Date().toISOString()),
        }));
      }
    } catch {
      /* Fallback if Supabase query fails. */
    }
  }

  const localRooms: RoomSummary[] = [];
  if (typeof window !== "undefined") {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(LOCAL_PREFIX)) continue;
      try {
        const room = JSON.parse(localStorage.getItem(key) ?? "") as GameSession;
        localRooms.push({
          sessionId: room.config.sessionId,
          sessionName: room.config.sessionName,
          authorName: room.config.authorName || "Bạn",
          buildingImageUrl: room.config.buildingImageUrl || "/symbolic-party-house.jpg",
          questionCount: room.config.stagesData.reduce((sum, stage) => sum + stage.questions.filter((question) => !question.isBackup).length, 0),
          memberCount: room.members.length,
          updatedAt: room.state.updatedAt,
        });
      } catch { /* Ignore invalid local drafts. */ }
    }
  }

  return uniqueRooms(localRooms);
}

function uniqueRooms(rooms: RoomSummary[]) {
  return [...new Map(rooms.map((room) => [room.sessionId, room])).values()];
}

export async function saveGameState(state: GameState): Promise<void> {
  const stored = normalizeSessionGrid(readLocal(state.sessionId) ?? createDemoSession(state.sessionId));
  writeLocal({ ...stored, state });
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const { error } = await supabase.from("GameState").upsert({
      session_id: state.sessionId,
      current_stage: state.currentStage,
      grid_status: state.gridStatus,
      question_cursor: state.questionCursor,
      completed: state.completed,
      has_guessed_correctly: state.hasGuessedCorrectly ?? false,
      guessed_name: state.guessedName ?? null,
      bg_music_url: state.bgMusicUrl ?? null,
      updated_at: state.updatedAt,
    });
    if (error) {
      console.warn("Supabase upsert GameState full error, falling back:", error.message);
      await supabase.from("GameState").upsert({
        session_id: state.sessionId,
        current_stage: state.currentStage,
        grid_status: state.gridStatus,
        question_cursor: state.questionCursor,
        completed: state.completed,
        updated_at: state.updatedAt,
      });
    }
  } catch (err) {
    console.error("Failed to save GameState to Supabase:", err);
  }
}

export function subscribeToGameState(sessionId: string, onState: (state: GameState) => void) {
  const supabase = getSupabase();
  let realtime: RealtimeChannel | null = null;
  let broadcast: BroadcastChannel | null = null;

  if (supabase) {
    realtime = supabase.channel(`game:${sessionId}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "GameState", filter: `session_id=eq.${sessionId}` },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        onState({
          sessionId,
          currentStage: Number(row.current_stage),
          gridStatus: row.grid_status as GameState["gridStatus"],
          questionCursor: row.question_cursor as Record<string, number>,
          completed: Boolean(row.completed),
          hasGuessedCorrectly: Boolean(row.has_guessed_correctly),
          guessedName: (row.guessed_name as string | null) ?? undefined,
          bgMusicUrl: (row.bg_music_url as string | null) ?? undefined,
          updatedAt: String(row.updated_at),
        });
      },
    ).subscribe();
  } else if (typeof window !== "undefined") {
    broadcast = new BroadcastChannel(CHANNEL_NAME);
    broadcast.onmessage = (event) => {
      if (event.data?.sessionId === sessionId) onState(event.data.state);
    };
  }

  return () => {
    if (realtime) void supabase?.removeChannel(realtime);
    broadcast?.close();
  };
}

export async function uploadAsset(file: File, sessionId: string, kind: "building" | "avatar" | "audio") {
  const supabase = getSupabase();
  if (!supabase) return fileToDataUrl(file);
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const path = `${sessionId}/${kind}-${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("game-assets").upload(path, file, { upsert: false });
  if (error) throw error;
  return supabase.storage.from("game-assets").getPublicUrl(path).data.publicUrl;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function deleteRoom(sessionId: string): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("GameState").delete().eq("session_id", sessionId);
      await supabase.from("TeamMembers").delete().eq("session_id", sessionId);
      await supabase.from("GameConfig").delete().eq("session_id", sessionId);
    } catch {
      /* continue deleting local */
    }
  }
  if (typeof window !== "undefined") {
    localStorage.removeItem(`${LOCAL_PREFIX}${sessionId}`);
  }
}

export async function resetGameState(session: GameSession): Promise<GameState> {
  const newState: GameState = {
    sessionId: session.config.sessionId,
    currentStage: 1,
    gridStatus: createGridStatus(session.config.gridRows, session.config.gridCols),
    questionCursor: { "1": 0, "2": 0, "3": 0, "4": 0 },
    completed: false,
    hasGuessedCorrectly: false,
    guessedName: undefined,
    bgMusicUrl: session.state.bgMusicUrl ?? session.config.bgMusicUrl,
    updatedAt: new Date().toISOString(),
  };
  await saveGameState(newState);
  return newState;
}

export async function applyMusicToAllRooms(musicUrl: string): Promise<void> {
  if (typeof window !== "undefined") {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(LOCAL_PREFIX)) continue;
      try {
        const room = JSON.parse(localStorage.getItem(key) ?? "") as GameSession;
        room.config.bgMusicUrl = musicUrl;
        room.state.bgMusicUrl = musicUrl;
        if (room.config.stagesData.length > 0) {
          (room.config.stagesData[0] as unknown as { bgMusicUrl?: string }).bgMusicUrl = musicUrl;
        }
        localStorage.setItem(key, JSON.stringify(room));
      } catch { /* ignore */ }
    }
  }
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const { data: configs } = await supabase.from("GameConfig").select("session_id, stages_data");
    if (configs && configs.length > 0) {
      for (const item of configs) {
        const stages = (item.stages_data ?? []) as StageConfig[];
        if (stages.length > 0) {
          (stages[0] as unknown as { bgMusicUrl?: string }).bgMusicUrl = musicUrl;
        }
        await supabase.from("GameConfig").update({ stages_data: stages }).eq("session_id", item.session_id);
        try {
          await supabase.from("GameState").update({ bg_music_url: musicUrl }).eq("session_id", item.session_id);
        } catch { /* optional column */ }
      }
    }
  } catch (err) {
    console.error("Error applying music to all rooms in Supabase:", err);
  }
}

