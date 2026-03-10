import type { Metadata } from "next";
import Image from "next/image";
import ChatBot from "@/components/ChatBot";
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
      <body className="ambient-bg">
        <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#060a18]/80 border-b border-white/[0.06] px-6 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <Image src="/logo.jpg" alt="Vantage" width={28} height={28} className="rounded-lg" />
            <span className="text-lg font-bold bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              Vantage
            </span>
          </a>
          <div className="flex gap-6 text-sm font-medium">
            <a href="/goals" className="text-slate-400 hover:text-cyan-300 transition">Goals</a>
            <a href="/goals/new" className="text-slate-400 hover:text-cyan-300 transition">New Goal</a>
            <a href="/goals/history" className="text-slate-400 hover:text-cyan-300 transition">Goals History</a>
            <a href="/embeddings" className="text-slate-400 hover:text-cyan-300 transition">Embeddings</a>
            <a href="/settings" className="text-slate-400 hover:text-cyan-300 transition">Settings</a>
          </div>
        </nav>
        <main>{children}</main>
        <ChatBot />
      </body>
    </html>
  );
}
