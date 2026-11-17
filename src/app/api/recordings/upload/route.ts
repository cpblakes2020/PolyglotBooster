import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { maxRecordingBytes, recordingContentTypes, recordingsPrefix } from "@/lib/storage/recordings";

// Where this account's recordings go, for the study desk's upload to name them.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({ prefix: recordingsPrefix(session.user.id) });
}

// Lets the browser upload a recording straight to storage, so it isn't held
// to the 4.5 MB limit on requests to this server. Only this account's folder,
// audio (or a video's sound) and up to OpenAI's 25 MB are allowed.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const userId = session.user.id;
  try {
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(recordingsPrefix(userId))) throw new Error("Recordings can only be saved in your own account.");
        return { allowedContentTypes: recordingContentTypes, maximumSizeInBytes: maxRecordingBytes, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The recording couldn't be uploaded." }, { status: 400 });
  }
}
