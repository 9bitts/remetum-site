import { NextRequest, NextResponse } from "next/server";

const apiUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

/** Proxy authenticated media so same-origin /media works when cookies are shared. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id || id.includes("..")) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }

  const upstream = await fetch(`${apiUrl}/media/${encodeURIComponent(id)}`, {
    headers: {
      cookie: request.headers.get("cookie") ?? "",
      accept: request.headers.get("accept") ?? "*/*",
    },
    cache: "no-store",
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return new NextResponse(text || "Não encontrado", {
      status: upstream.status,
    });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const disposition = upstream.headers.get("content-disposition");
  const cache = upstream.headers.get("cache-control");
  if (contentType) headers.set("content-type", contentType);
  if (disposition) headers.set("content-disposition", disposition);
  if (cache) headers.set("cache-control", cache);
  headers.set("x-content-type-options", "nosniff");

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
