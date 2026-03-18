"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const agents = [
  {
    icon: "�",
    title: "Planner Agent",
    description:
      "Creates a deterministic schedule respecting your availability, deadlines, and preferences. No two runs differ.",
    gradient: "from-indigo-500/20 to-violet-500/10",
    border: "border-indigo-500/20",
    glow: "group-hover:shadow-indigo-500/10",
  },
  {
    icon: "📥",
    title: "Retriever Agent",
    description:
      "Parses your PDFs, URLs, YouTube playlists, and GitHub repos. Extracts topics, milestones, and estimates study hours.",
    gradient: "from-cyan-500/20 to-blue-500/10",
    border: "border-cyan-500/20",
    glow: "group-hover:shadow-cyan-500/10",
  },
  {
    icon: "🚀",
    title: "Executor Agent",
    description:
      "Syncs your plan to Microsoft Calendar, sends reminders, and triggers partial replans when blocks are missed.",
    gradient: "from-purple-500/20 to-pink-500/10",
    border: "border-purple-500/20",
    glow: "group-hover:shadow-purple-500/10",
  },
];

const stats = [
  { value: "3", label: "AI Agents" },
  { value: "∞", label: "Goal Types" },
  { value: "24/7", label: "Adaptive" },
  { value: "∞", label: "Work Productivity" },
];

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.95]);

  return (
    <div className="min-h-screen overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-cyan-500/[0.04] blur-[120px] animate-float" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-500/[0.05] blur-[100px] animate-float" style={{ animationDelay: "-3s" }} />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-purple-500/[0.03] blur-[80px] animate-float" style={{ animationDelay: "-1.5s" }} />
      </div>

      {/* HERO SECTION */}
      <motion.section
        ref={heroRef}
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative z-10 flex flex-col items-center justify-center text-center min-h-[85vh] px-6"
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-cyan-500/20 blur-2xl animate-glow-pulse" />
            <Image
              src="/logo.jpg"
              alt="Vantage"
              width={80}
              height={80}
              className="relative rounded-2xl border border-white/10 shadow-2xl"
            />
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl md:text-7xl font-bold tracking-tight"
        >
          <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Vantage
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 text-lg md:text-xl text-slate-400 max-w-2xl leading-relaxed"
        >
          Universal Goal Orchestrator — create any goal, upload your materials,
          and get a workload-aware, constraint-aware schedule powered by three
          cooperating AI agents.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="mt-10 flex gap-4"
        >
          <Link
            href="/goals/new"
            className="group relative px-8 py-3.5 rounded-xl font-semibold text-sm overflow-hidden transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-300 group-hover:brightness-110" />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-cyan-400 to-blue-500" />
            <span className="relative text-white">Create New Goal</span>
          </Link>
          <Link
            href="/goals"
            className="px-8 py-3.5 rounded-xl font-semibold text-sm border border-white/[0.1] text-slate-300 hover:text-cyan-300 hover:border-cyan-500/30 hover:bg-white/[0.02] transition-all duration-300"
          >
            View Dashboard
          </Link>
        </motion.div>

        
      </motion.section>

      {/* STATS BAR */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="glass-card p-6 grid grid-cols-2 md:grid-cols-4 gap-6"
        >
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              custom={i}
              variants={fadeUp}
              className="text-center"
            >
              <p className="text-2xl md:text-3xl font-bold text-cyan-300">{stat.value}</p>
              <p className="text-xs uppercase tracking-widest text-slate-500 mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* AGENT CARDS */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="text-center mb-12"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-500/80 mb-3">Architecture</p>
          <h2 className="text-3xl md:text-4xl font-bold text-cyan-50">Three Agents, One Mission</h2>
          <p className="mt-3 text-slate-400 max-w-xl mx-auto">
            Each agent handles a distinct phase of goal execution — retrieval, planning, and action.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.title}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={fadeUp}
              className="group"
            >
              <div className={`relative h-full rounded-2xl border ${agent.border} bg-gradient-to-br ${agent.gradient} backdrop-blur-xl p-6 transition-all duration-500 hover:translate-y-[-4px] hover:shadow-2xl ${agent.glow}`}>
                <div className="text-3xl mb-4">{agent.icon}</div>
                <h3 className="font-bold text-lg text-cyan-50 mb-2">{agent.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {agent.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* WORKFLOW SECTION */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="text-center mb-12"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-400/80 mb-3">How It Works</p>
          <h2 className="text-3xl md:text-4xl font-bold text-cyan-50">From Idea to Schedule</h2>
        </motion.div>

        <div className="space-y-6">
          {[
            { step: "01", title: "Describe Your Goal", desc: "Type a natural language scenario — learn ML, prep for a marathon, or build a side project." },
            { step: "02", title: "Materials Get Parsed", desc: "The Retriever extracts topics, estimates hours, and builds a dependency-ordered knowledge graph." },
            { step: "03", title: "Plan Is Generated", desc: "The Planner fills your calendar respecting sleep, commitments, and preferred study windows." },
            { step: "04", title: "Stay On Track", desc: "Mark blocks done or partial. Missed blocks trigger automatic replanning to keep your deadline safe." },
          ].map((item, i) => (
            <motion.div
              key={item.step}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={fadeUp}
              className="glass-card p-5 flex items-start gap-5"
            >
              <span className="text-2xl font-black text-cyan-500/30 font-mono shrink-0">{item.step}</span>
              <div>
                <h3 className="font-semibold text-cyan-50 mb-1">{item.title}</h3>
                <p className="text-sm text-slate-400">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* RYUK CHATBOT SECTION */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="glass-card p-8 md:p-10 flex flex-col md:flex-row items-center gap-8"
        >
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-cyan-500/15 blur-xl animate-glow-pulse" />
              <Image
                src="/bot.avif"
                alt="Ryuk chatbot"
                width={96}
                height={96}
                className="relative rounded-full border-2 border-cyan-500/20 shadow-xl"
              />
            </div>
          </div>
          <div className="text-center md:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-500/80 mb-2">Always Available</p>
            <h2 className="text-2xl md:text-3xl font-bold text-cyan-50 mb-3">
              Meet <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">Ryuk</span>, Your Study Buddy
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-lg">
              Stuck wondering when your next session is? Can&apos;t remember which topic comes next? Ryuk is a smart chatbot that lives right in your browser — always at the bottom-right corner. It knows your goals, topics, and schedule inside out. Just ask.
            </p>
          </div>
        </motion.div>
      </section>

      {/* BOTTOM CTA */}
      <section className="relative z-10 text-center pb-32 px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-2xl md:text-3xl font-bold text-cyan-50 mb-4">Ready to orchestrate your goals?</h2>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            Set up your profile, describe your first goal, and let the agents do the rest.
          </p>
          <Link
            href="/goals/new"
            className="inline-block px-8 py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:brightness-110 transition-all duration-300 shadow-lg shadow-cyan-500/20"
          >
            Get Started
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
