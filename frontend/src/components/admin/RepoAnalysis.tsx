import { useActivityMetrics, useNlpMetrics } from "../../api/admin";

export function RepoAnalysis() {
  const { data: activity } = useActivityMetrics(30);
  const { data: nlp } = useNlpMetrics();

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold text-zinc-300">Repo Analysis</h2>

      {/* NLP Metrics */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 mb-2">NLP Metrics (main branch)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Files", value: nlp?.files ?? "—" },
            { label: "Words", value: nlp?.word_count?.toLocaleString() ?? "—" },
            { label: "Flesch-Kincaid", value: nlp?.flesch_kincaid ?? "—" },
            { label: "Reading Ease", value: nlp?.flesch_reading_ease ?? "—" },
          ].map((m) => (
            <div key={m.label} className="card p-3 text-center">
              <div className="text-lg font-semibold text-zinc-100">{m.value}</div>
              <div className="text-xs text-zinc-500 mt-1">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* User Activity */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 mb-2">User Activity (last 30 days)</h3>
        {!activity?.activity?.length && (
          <div className="text-zinc-600 text-sm py-4 text-center">No commits in the last 30 days</div>
        )}
        <div className="space-y-1.5">
          {(activity?.activity ?? []).map((u) => (
            <div key={u.email} className="card p-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate">{u.email}</div>
                <div className="text-xs text-zinc-500 mt-0.5">Last: {u.last_commit}</div>
              </div>
              <div className="flex gap-4 shrink-0 text-right">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">{u.commits}</div>
                  <div className="text-xs text-zinc-500">commits</div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-100">{u.active_days}</div>
                  <div className="text-xs text-zinc-500">days</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
