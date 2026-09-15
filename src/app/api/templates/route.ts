import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { createTemplate, listTemplates } from "@/lib/storage/templates";
import { isSupportedLanguage } from "@/lib/presets";
import type { TemplateScope } from "@/lib/types";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function isValidScope(value: unknown): value is TemplateScope {
  return value === "general" || (typeof value === "string" && isSupportedLanguage(value));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const templates = await listTemplates();
    return NextResponse.json({ templates, isAdmin: isAdminEmail(session.user.email) });
  } catch {
    return NextResponse.json({ error: "Tasks could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isAdminEmail(session.user.email)) return NextResponse.json({ error: "Only an admin can create tasks." }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = body?.name;
  const description = body?.description;
  const instruction = body?.instruction;
  const scope = body?.scope;
  const icon = body?.icon;

  if (typeof name !== "string" || !name.trim() || name.length > 80) {
    return NextResponse.json({ error: "Enter a task name up to 80 characters." }, { status: 400 });
  }
  if (typeof description !== "string" || !description.trim() || description.length > 160) {
    return NextResponse.json({ error: "Enter a short description up to 160 characters." }, { status: 400 });
  }
  if (typeof instruction !== "string" || !instruction.trim() || instruction.length > 4000) {
    return NextResponse.json({ error: "Enter task instructions up to 4,000 characters." }, { status: 400 });
  }
  if (!isValidScope(scope)) {
    return NextResponse.json({ error: "Choose General or a supported source language." }, { status: 400 });
  }
  if (icon !== undefined && (typeof icon !== "string" || icon.length > 4)) {
    return NextResponse.json({ error: "Icon must be 4 characters or fewer." }, { status: 400 });
  }

  const slug = slugify(name);
  if (!slug) return NextResponse.json({ error: "Enter a task name using letters or numbers." }, { status: 400 });
  const id = scope === "general" ? slug : `${slug}-${scope.toLowerCase()}`;

  try {
    const template = await createTemplate({ id, name: name.trim(), description: description.trim(), instruction: instruction.trim(), scope, icon: icon?.trim() || undefined });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The task could not be created." }, { status: 409 });
  }
}
