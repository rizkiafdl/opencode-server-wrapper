import { useState } from "react";
import { Check, X, Eye, EyeOff, GitBranch } from "lucide-react";
import { useMergeQueue, useApprove, useReject, useQueueDiff } from "../../api/admin";

function DiffPanel({ id }: { id: number }) {
  const { data, isLoading } = useQueueDiff(id, true);
  if (isLoading) return <div className="text-zinc-500 text-xs p-3">Loading diff…</div>;
  if (!data) return null;
  return (
    <div className="border-t border-zinc-800 p-3">
      {data.stat && (
        <pre className="text-xs text-zinc-400 whitespace-pre-wrap mb-2">{data.stat}</pre>
      )}
      <pre className="text-xs overflow-x-auto whitespace-pre font-mono max-h-96 overflow-y-auto leading-relaxed">
        {data.diff.split("\n").map((line, i) => (
          <span
            key={i}
            className={
              line.startsWith("+") && !line.startsWith("+++")
                ? "text-green-400"
                : line.startsWith("-") && !line.startsWith("---")
                ? "text-red-400"
                : line.startsWith("@@")
                ? "text-blue-400"
                : "text-zinc-400"
            }
          >
            {line}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}

export function MergeQueue() {
  const { data, isLoading } = useMergeQueue("pending");
  const approve = useApprove();
  const reject = useReject();
  const [expanded, setExpanded] = useState<number | null>(null);
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-zinc-300">
        Merge Queue <span className="badge-yellow ml-2">{items.length} pending</span>
      </h2>

      {isLoading && <div className="text-zinc-500 text-sm">Loading…</div>}

      {!isLoading && items.length === 0 && (
        <div className="text-zinc-600 text-sm py-8 text-center">No pending branches</div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="card overflow-hidden">
            <div className="p-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <GitBranch size={14} className="text-zinc-500 shrink-0" />
                  <span className="text-zinc-100 text-sm font-medium truncate">{item.branch}</span>
                  <span className="badge-zinc">{item.username}</span>
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  pushed {new Date(item.pushed_at).toLocaleString()}
                </div>
                {item.diff_stat && (
                  <pre className="text-xs text-zinc-500 mt-1 whitespace-pre-wrap">{item.diff_stat.slice(0, 120)}</pre>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  className="btn-ghost"
                  title="View diff"
                >
                  {expanded === item.id ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Approve merge for ${item.branch}?`)) {
                      approve.mutate({ id: item.id, approvedBy: "admin" });
                    }
                  }}
                  className="btn-success"
                  disabled={approve.isPending}
                >
                  <Check size={13} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Reject and delete ${item.branch}?`)) {
                      reject.mutate(item.id);
                    }
                  }}
                  className="btn-danger"
                  disabled={reject.isPending}
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {expanded === item.id && <DiffPanel id={item.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}
