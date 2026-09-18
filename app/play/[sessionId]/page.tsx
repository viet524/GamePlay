import { GameExperience } from "@/components/game/game-experience";

export default async function PlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <GameExperience sessionId={sessionId} />;
}
