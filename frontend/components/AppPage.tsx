import type { ReactNode } from "react";
import Footer from "@/components/landing/Footer";

// A page of the application with the site footer, which stays at the bottom of short pages.
export default function AppPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-4.1rem)] flex-col">
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
