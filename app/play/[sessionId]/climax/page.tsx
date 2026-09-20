import { FinaleScene } from "@/components/game/finale-scene";

export default async function ClimaxPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <FinaleScene sessionId={sessionId} />;
}
