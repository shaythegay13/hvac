import portfolio from "@/data/portfolio.json";

export async function GET() {
  return Response.json(portfolio);
}
