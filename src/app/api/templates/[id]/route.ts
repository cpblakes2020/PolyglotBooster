import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { deleteTemplate, updateTemplate } from "@/lib/storage/templates";
import { isSupportedLanguage } from "@/lib/presets";
import type { TemplateScope } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

function isValidScope(value: unknown): value is TemplateScope {
  return value === "general" || (typeof value === "string" && isSupportedLanguage(value));
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isAdminEmail(session.user.email)) return NextResponse.json({ error: "Only an admin can edit tasks." }, { status: 403 });

  const { id } = await context.params;
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

  try {
    const template = await updateTemplate(id, { name: name.trim(), description: description.trim(), instruction: instruction.trim(), scope, icon: icon?.trim() || undefined });
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The task could not be saved." }, { status: 404 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isAdminEmail(session.user.email)) return NextResponse.json({ error: "Only an admin can delete tasks." }, { status: 403 });

  const { id } = await context.params;
  try {
    await deleteTemplate(id);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "The task could not be deleted." }, { status: 404 });
  }
}
