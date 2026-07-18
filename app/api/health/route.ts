import { NextResponse } from "next/server";

import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      app: "ma-famille-en-couleur",
      framework: "nextjs",
      supabaseConfigured: Boolean(getSupabaseConfig()),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
