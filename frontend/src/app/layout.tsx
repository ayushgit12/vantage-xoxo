import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vantage — Goal Orchestrator",
  description: "Create any goal, get a workload-aware schedule",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b bg-white px-6 py-3 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-brand-700">
            Vantage
          </a>
          <div className="flex gap-4 text-sm">
            <a href="/goals" className="hover:text-brand-600">Goals</a>
            <a href="/goals/new" className="hover:text-brand-600">New Goal</a>
            <a href="/settings" className="hover:text-brand-600">Settings</a>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
