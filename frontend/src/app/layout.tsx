import type { Metadata } from "next";
import Image from "next/image";
import { Manrope, Space_Grotesk } from "next/font/google";
import ChatBot from "@/components/ChatBot";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

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
      <body className={`${manrope.variable} ${spaceGrotesk.variable} app-shell ambient-bg`}>
        <nav className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 px-6 py-3 backdrop-blur-md flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <Image src="/logo.jpg" alt="Vantage" width={28} height={28} className="rounded-lg" />
            <span className="text-lg font-bold text-zinc-900" style={{ fontFamily: "var(--font-heading)" }}>
              Vantage
            </span>
          </a>
          <div className="flex gap-6 text-sm font-medium">
            <a href="/goals" className="text-zinc-600 hover:text-zinc-900 transition">Master Calendar</a>
            <a href="/goals/new" className="text-zinc-600 hover:text-zinc-900 transition">New Goal</a>
            <a href="/goals/history" className="text-zinc-600 hover:text-zinc-900 transition">Goals History</a>
            <a href="/stats" className="text-zinc-600 hover:text-zinc-900 transition">Planner Stats</a>
            <a href="/embeddings" className="text-zinc-600 hover:text-zinc-900 transition">Embeddings</a>
            <a href="/settings" className="text-zinc-600 hover:text-zinc-900 transition">Settings</a>
          </div>
        </nav>
        <main>{children}</main>
        <ChatBot />
      </body>
    </html>
  );
}
