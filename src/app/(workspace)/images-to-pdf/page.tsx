// Images to PDF page (Day 22).
//
// Lists the user's PNG/JPEG images (from the library, RLS) with
// checkboxes, in library order. Choosing images and a title and
// clicking "Create PDF" calls POST /api/documents/images-to-pdf,
// which creates a NEW PDF document in the library (one page per
// image). The source images are never touched.
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { ImagesToPdfClient } from "@/components/images-to-pdf/images-to-pdf-client";

function BackToFiles() {
  return (
    <Link
      href="/files"
      className="inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab]"
    >
      Back to files
    </Link>
  );
}

export default async function ImagesToPdfPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/images-to-pdf");

  const { data: images, error } = await supabase
    .from("documents")
    .select("id, title, mime_type, version")
    .in("mime_type", ["image/png", "image/jpeg"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[images-to-pdf page]", error);
    return (
      <EmptyState
        icon={FileWarning}
        title="Could not load your images"
        description="Your images could not be read. Check the setup and try again."
        action={<BackToFiles />}
      />
    );
  }
  return (
    <ImagesToPdfClient
      images={(images ?? [])
        .filter(
          (d): d is typeof d & { mime_type: string } => d.mime_type !== null
        )
        .map((d) => ({
          id: d.id,
          title: d.title,
          mimeType: d.mime_type,
          version: d.version,
        }))}
    />
  );
}
