import { NextRequest, NextResponse } from "next/server";

function appUrl(request: NextRequest) {
  return new URL("/app?share-target=1", request.url);
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(appUrl(request), 303);
}

export async function POST(request: NextRequest) {
  return NextResponse.redirect(appUrl(request), 303);
}
