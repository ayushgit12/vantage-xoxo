"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  Database,
  Target,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const agents = [
  {
    icon: Target,
    title: "Planner Agent",
    description:
      "Creates a deterministic schedule respecting your availability, deadlines, and preferences. No two runs differ.",
  },
  {
    icon: Database,
    title: "Retriever Agent",
    description:
      "Parses your PDFs, URLs, YouTube playlists, and GitHub repos. Extracts topics, milestones, and estimates study hours.",
  },
  {
    icon: CalendarDays,
    title: "Executor Agent",
    description:
      "Syncs your plan to Microsoft Calendar, sends reminders, and triggers partial replans when blocks are missed.",
  },
];

const stats = [
  { value: "3", label: "Cooperating agents" },
  { value: "7 days", label: "Rolling planning window" },
  { value: "1", label: "Unified schedule" },
  { value: "24/7", label: "Replan readiness" },
];

export default function Home() {
  return (
    <div className="min-h-screen pb-24">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-[-10%] top-[-25%] h-[620px] w-[620px] rounded-full bg-zinc-300/20 blur-[140px]" />
        <div className="absolute bottom-[-25%] right-[-8%] h-[560px] w-[560px] rounded-full bg-zinc-400/15 blur-[120px]" />
      </div>

      <motion.section
        initial="hidden"
        animate="visible"
        className="relative z-10 mx-auto grid max-w-6xl gap-8 px-6 pb-20 pt-20 md:grid-cols-[1.2fr_0.8fr] md:items-center"
      >
        <motion.div
          custom={0}
          variants={fadeUp}
          className="space-y-6"
        >
          <h1 className="max-w-3xl text-5xl font-bold leading-[0.95] text-zinc-950 md:text-7xl">
            Build any goal.
            <br />
            Get one coherent schedule.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-zinc-600 md:text-lg">
            Vantage orchestrates your materials, constraints, and deadlines into a
            single plan you can execute day by day - with replans when reality shifts.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 bg-zinc-900 px-6 text-white hover:bg-zinc-800">
              <Link href="/goals/new" className="inline-flex items-center gap-2">
                Start a goal
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 border-zinc-300 bg-white px-6 text-zinc-700 hover:text-zinc-900">
              <Link href="/goals">Open dashboard</Link>
            </Button>
          </div>
        </motion.div>

        <motion.div
          custom={1}
          variants={fadeUp}
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-md"
        >
          <div className="mb-4 flex items-center gap-3">
            <Image src="/logo.jpg" alt="Vantage" width={40} height={40} className="rounded-lg" />
            <div>
              <p className="text-sm font-semibold text-zinc-900">Vantage Control Center</p>
              <p className="text-xs text-zinc-500">Unified goal orchestration</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              "Retriever builds topic graph from your materials",
              "Planner allocates workload across your week",
              "Executor syncs blocks and tracks progress",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                <CheckCircle2 className="h-4 w-4 text-zinc-700" />
                <p className="text-sm text-zinc-700">{item}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-14">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid grid-cols-2 gap-4 md:grid-cols-4"
        >
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              custom={i}
              variants={fadeUp}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <p className="text-2xl font-bold text-zinc-950 md:text-3xl">{stat.value}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.22 }}
          className="mb-10"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">Architecture</p>
          <h2 className="mt-2 text-3xl font-bold text-zinc-950 md:text-4xl">Three agents, one system</h2>
          <p className="mt-3 max-w-2xl text-zinc-600">
            Each layer does one job well, then hands off to the next. The output is a
            plan you can trust and execute.
          </p>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-3">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.title}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <div className="h-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <agent.icon className="mb-4 h-6 w-6 text-zinc-700" />
                <h3 className="mb-2 text-lg font-bold text-zinc-950">{agent.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-600">{agent.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.22 }}
          className="mb-10"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">How it works</p>
          <h2 className="mt-2 text-3xl font-bold text-zinc-950 md:text-4xl">From idea to daily blocks</h2>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              step: "01",
              title: "Describe your scenario",
              desc: "Define the goal, deadline, and constraints in plain language.",
            },
            {
              step: "02",
              title: "Retriever extracts structure",
              desc: "Materials are converted into topics, dependencies, and effort estimates.",
            },
            {
              step: "03",
              title: "Planner builds schedule",
              desc: "A conflict-aware plan is generated around your availability and commitments.",
            },
            {
              step: "04",
              title: "Executor keeps momentum",
              desc: "Done, partial, or missed blocks trigger controlled updates to stay on track.",
            },
          ].map((item, i) => (
            <motion.div
              key={item.step}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-zinc-500">{item.step}</p>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-zinc-700" />
                <div>
                  <h3 className="mb-1 font-semibold text-zinc-900">{item.title}</h3>
                  <p className="text-sm text-zinc-600">{item.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.22 }}
          className="grid gap-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-md md:grid-cols-[auto_1fr] md:items-center"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50">
            <Bot className="h-8 w-8 text-zinc-700" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">Built-in assistant</p>
            <h2 className="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">Ryuk is always in context</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600">
              Ask about upcoming blocks, topic order, or missed sessions. Ryuk replies from your
              actual planner data, so support is immediate and grounded.
            </p>
          </div>
        </motion.div>
      </section>

      <section className="relative z-10 px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.22 }}
          className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-zinc-900 px-6 py-12 text-center md:px-10"
        >
          <h2 className="text-2xl font-bold text-white md:text-3xl">Ready to orchestrate your goals?</h2>
          <p className="mx-auto mb-8 mt-3 max-w-2xl text-sm text-zinc-300">
            Set your profile, define your first goal, and start executing a plan that adapts with you.
          </p>
          <Button asChild size="lg" variant="secondary" className="h-11 bg-white px-6 text-zinc-900 hover:bg-zinc-100">
            <Link href="/goals/new" className="inline-flex items-center gap-2">
              Create new goal
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      </section>
    </div>
  );
}
