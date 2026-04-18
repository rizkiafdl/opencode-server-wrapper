import { useState } from "react";
import { Play, Clock } from "lucide-react";
import { useAggregations, useTriggerAggregation } from "../../api/admin";

function StatusBadge({ status }: { status: string }) {
  if (status === "done") return <span className="badge-green">{status}</span>;
  if (status === "failed") return <span className="badge-red">{status}</span>;
  return <span className="badge-yellow animate-pulse">{status}</span>;
}

export function Aggregator() {
  const [sinceDate, setSinceDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const { data } = useAggregations();
  const trigger = useTriggerAggregation();
  const jobs = data?.jobs ?? [];

  const handleTrigger = () => {
    if (!sinceDate) return;
    trigger.mutate({ since_date: sinceDate, triggered_by: "admin" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">Branch Aggregator</h2>
        <div className="card p-4 space-y-3">
          <p className="text-xs text-zinc-500">
            Synthesize all user branches into a consolidated output branch using the admin AI instance.
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400 shrink-0">Since date:</label>
            <input
              type="date"
              value={sinceDate}
              onChange={(e) => setSinceDate(e.target.value)}
              className="input max-w-[160px] text-xs py-1.5"
            />
            <button
              onClick={handleTrigger}
              disabled={trigger.isPending || !sinceDate}
              className="btn-primary flex items-center gap-1.5"
            >
              <Play size={13} />
              {trigger.isPending ? "Starting…" : "Run Aggregation"}
            </button>
          </div>
          {trigger.isSuccess && (
            <p className="text-xs text-green-400">Aggregation started — see job below.</p>
          )}
          {trigger.isError && (
            <p className="text-xs text-red-400">{(trigger.error as Error).message}</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-zinc-400 mb-2">Recent Jobs</h3>
        {jobs.length === 0 && (
          <div className="text-zinc-600 text-sm py-4 text-center">No aggregation jobs yet</div>
        )}
        <div className="space-y-2">
          {jobs.map((job) => (
            <div key={job.id} className="card p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-zinc-500" />
                  <span className="text-zinc-300 text-sm">Since {job.since_date}</span>
                  <StatusBadge status={job.status} />
                </div>
                <span className="text-xs text-zinc-500">
                  by {job.triggered_by} · {new Date(job.triggered_at).toLocaleString()}
                </span>
              </div>
              {job.output_branch && (
                <p className="text-xs text-blue-400 mt-1">→ {job.output_branch}</p>
              )}
              {job.branches_read && (
                <p className="text-xs text-zinc-500 mt-1">
                  Branches: {(JSON.parse(job.branches_read) as string[]).join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
