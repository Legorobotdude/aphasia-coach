import { NextResponse } from "next/server";

export async function GET() {
  // Create a response
  const response = NextResponse.json({ success: true });

  // Clear the redirectAfterLogin cookie
  response.cookies.set("redirectAfterLogin", "", {
    path: "/",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
  });

  return response;
}
