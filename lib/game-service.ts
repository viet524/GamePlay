import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { createDemoSession, createGridStatus } from "./mock-game";
import type { GameSession, GameState } from "./game-types";

const LOCAL_PREFIX = "xay-nha-dang:";
const CHANNEL_NAME = "xay-nha-dang-sync";

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
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

export async function loadSession(sessionId: string): Promise<GameSession> {
  const supabase = getSupabase();
  if (!supabase) return readLocal(sessionId) ?? createDemoSession(sessionId);

  const [{ data: config }, { data: members }, { data: state }] = await Promise.all([
    supabase.from("GameConfig").select("*").eq("session_id", sessionId).maybeSingle(),
    supabase.from("TeamMembers").select("*").eq("session_id", sessionId).order("created_at"),
    supabase.from("GameState").select("*").eq("session_id", sessionId).maybeSingle(),
  ]);

  if (!config) return readLocal(sessionId) ?? createDemoSession(sessionId);
  const rows = Number(config.grid_rows);
  const cols = Number(config.grid_cols);
  return {
    config: {
      sessionId,
      sessionName: config.session_name ?? "Phòng thi công",
      buildingName: config.building_name ?? "Công trình bí mật",
      buildingImageUrl: config.building_image_url || "/demo-building.svg",
      gridRows: rows,
      gridCols: cols,
      quoteText: config.quote_text,
      stagesData: config.stages_data,
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
      updatedAt: state.updated_at,
    } : {
      sessionId,
      currentStage: 1,
      gridStatus: createGridStatus(rows, cols),
      questionCursor: { "1": 0, "2": 0, "3": 0, "4": 0 },
      completed: false,
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function saveSession(session: GameSession): Promise<void> {
  writeLocal(session);
  const supabase = getSupabase();
  if (!supabase) return;

  const { error: configError } = await supabase.from("GameConfig").upsert({
    session_id: session.config.sessionId,
    session_name: session.config.sessionName,
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

export async function saveGameState(state: GameState): Promise<void> {
  const stored = readLocal(state.sessionId) ?? createDemoSession(state.sessionId);
  writeLocal({ ...stored, state });
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("GameState").upsert({
    session_id: state.sessionId,
    current_stage: state.currentStage,
    grid_status: state.gridStatus,
    question_cursor: state.questionCursor,
    completed: state.completed,
    updated_at: state.updatedAt,
  });
  if (error) throw error;
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

export async function uploadAsset(file: File, sessionId: string, kind: "building" | "avatar") {
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
