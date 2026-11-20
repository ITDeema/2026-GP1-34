
"use client";

import { Toaster } from "sonner";
import { useT } from "@/lib/i18n";

export default function AppToaster() {
  const { lang } = useT();

  return (
    <Toaster
      position="top-center"
      dir={lang === "ar" ? "rtl" : "ltr"}
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        style: {
          fontFamily:
            lang === "ar"
              ? "var(--font-plex-ar), sans-serif"
              : "var(--font-plex), sans-serif",
          borderRadius: "10px",
          border: "1px solid #D9D3C7",
          boxShadow: "0 12px 32px rgba(4, 24, 43, 0.12)",
        },
      }}
    />
  );
}
