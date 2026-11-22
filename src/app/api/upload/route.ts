import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { visibleProjectsWhere } from "@/lib/access";
import { IMAGE_TYPES, MAX_VIDEO_MB, VIDEO_TYPES } from "@/lib/media";

/**
 * Issues short-lived tokens so phones upload photos and videos straight to Vercel Blob.
 * That skips the 4.5 MB request limit on Vercel functions, so full-quality files fit.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("Log in to upload.");
        const [scope, id] = pathname.split("/");
        const allowed =
          scope === "projects"
            ? await db.project.findFirst({ where: { id, ...visibleProjectsWhere(user) }, select: { id: true } })
            : scope === "chats"
              ? await db.conversation.findFirst({ where: { id, members: { some: { userId: user.id } } }, select: { id: true } })
              : null;
        if (!allowed) throw new Error("You can't upload there.");
        return {
          allowedContentTypes: [...IMAGE_TYPES, ...VIDEO_TYPES],
          maximumSizeInBytes: MAX_VIDEO_MB * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
