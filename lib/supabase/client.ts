"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./config";

export function createSupabaseBrowserClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error("La configuration publique Supabase est absente.");
  }

  return createBrowserClient(config.url, config.anonKey);
}
