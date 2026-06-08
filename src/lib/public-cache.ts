import { NextResponse } from "next/server";

export const PUBLIC_SHORT_CACHE_SECONDS = 60;
export const PUBLIC_SHORT_CACHE_CONTROL = `public, max-age=0, s-maxage=${PUBLIC_SHORT_CACHE_SECONDS}, stale-while-revalidate=300`;

export function publicJson<T>(body: T, init?: ResponseInit) {
  const response = NextResponse.json(body, init);

  response.headers.set("Cache-Control", PUBLIC_SHORT_CACHE_CONTROL);

  return response;
}
