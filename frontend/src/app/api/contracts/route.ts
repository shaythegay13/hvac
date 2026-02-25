import contracts from "@/data/contracts.json";

export async function GET() {
  return Response.json(contracts);
}
