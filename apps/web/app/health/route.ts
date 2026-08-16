export function GET() {
  return Response.json({
    ok: true,
    service: "remetum-web",
    timestamp: new Date().toISOString(),
  });
}
