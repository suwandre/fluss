import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return Response.json({ error: "Missing holding ID" }, { status: 400 });
  }

  try {
    const [deleted] = await db
      .delete(holdings)
      .where(eq(holdings.id, id))
      .returning();

    if (!deleted) {
      return Response.json({ error: "Holding not found" }, { status: 404 });
    }

    return Response.json(deleted);
  } catch (error) {
    console.error("Failed to delete holding:", error);
    return Response.json({ error: "Failed to delete holding" }, { status: 500 });
  }
}
