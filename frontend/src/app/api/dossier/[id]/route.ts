import dossiers from "@/data/dossiers.json";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dossier = (dossiers as Record<string, unknown>)[id];
  if (!dossier) {
    return Response.json({ error: `Dossier not found for ${id}` }, { status: 404 });
  }
  return Response.json(dossier);
}
