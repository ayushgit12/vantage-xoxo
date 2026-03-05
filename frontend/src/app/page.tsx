import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4 py-12">
        <h1 className="text-4xl font-bold text-brand-900">
          Vantage
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Universal Goal Orchestrator — create any goal, upload your materials,
          and get a workload-aware, constraint-aware schedule powered by three
          cooperating AI agents.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="p-6 rounded-lg border bg-white shadow-sm">
          <div className="text-2xl mb-2">📥</div>
          <h3 className="font-semibold text-lg">Retriever Agent</h3>
          <p className="text-gray-600 text-sm mt-2">
            Parses your PDFs, URLs, YouTube playlists, and GitHub repos.
            Extracts topics, milestones, and estimates study hours.
          </p>
        </div>
        <div className="p-6 rounded-lg border bg-white shadow-sm">
          <div className="text-2xl mb-2">📋</div>
          <h3 className="font-semibold text-lg">Planner Agent</h3>
          <p className="text-gray-600 text-sm mt-2">
            Creates a deterministic schedule respecting your availability,
            deadlines, and preferences. No two runs differ.
          </p>
        </div>
        <div className="p-6 rounded-lg border bg-white shadow-sm">
          <div className="text-2xl mb-2">🚀</div>
          <h3 className="font-semibold text-lg">Executor Agent</h3>
          <p className="text-gray-600 text-sm mt-2">
            Syncs your plan to Microsoft Calendar, sends reminders,
            and triggers partial replans when blocks are missed.
          </p>
        </div>
      </div>

      <div className="text-center">
        <Link
          href="/goals/new"
          className="inline-block px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition"
        >
          Create Your First Goal
        </Link>
      </div>
    </div>
  );
}
