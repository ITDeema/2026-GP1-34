import type { ReactNode } from "react";

// A page of the application. The site footer is not shown inside the application.
export default function AppPage({ children }: { children: ReactNode }) {
  return <>{children}</>;
}