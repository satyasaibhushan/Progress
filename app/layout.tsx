import type { Metadata } from "next";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { ErrorBoundary } from "@/components/layout/error-boundary";

export const metadata: Metadata = {
  title: "Progress - Track Your Goals & Habits",
  description: "A comprehensive progress tracking application for goals, tasks, and habits",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ErrorBoundary>
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
