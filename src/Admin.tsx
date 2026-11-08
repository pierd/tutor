import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function Admin() {
  const wishlist = useQuery(api.users.listWishlist);
  const approved = useQuery(api.users.listApproved);
  const approve = useMutation(api.users.approve);
  const revoke = useMutation(api.users.revoke);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Wishlist{wishlist ? ` (${wishlist.length})` : ""}
        </h2>
        <UserList
          users={wishlist?.map((u) => ({
            id: u._id,
            email: u.email,
            date: u._creationTime,
          }))}
          dateLabel="Joined"
          empty="Nobody is waiting."
          actionLabel="Approve"
          actionClass="bg-gray-900 text-white hover:bg-gray-800"
          onAction={(userId) => void approve({ userId })}
        />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Approved</h2>
        <UserList
          users={approved?.map((u) => ({
            id: u._id,
            email: u.email,
            date: u.approvedAt,
          }))}
          dateLabel="Approved"
          empty="No approved users yet."
          actionLabel="Revoke"
          actionClass="bg-red-50 text-red-600 hover:bg-red-100"
          onAction={(userId) => {
            if (confirm("Revoke access for this user?")) void revoke({ userId });
          }}
        />
      </section>
    </div>
  );
}

type Row<Id> = { id: Id; email: string | null; date: number };

function UserList<Id extends string>({
  users,
  dateLabel,
  empty,
  actionLabel,
  actionClass,
  onAction,
}: {
  users: Row<Id>[] | undefined;
  dateLabel: string;
  empty: string;
  actionLabel: string;
  actionClass: string;
  onAction: (id: Id) => void;
}) {
  if (users === undefined) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }
  if (users.length === 0) {
    return <div className="text-sm text-gray-500">{empty}</div>;
  }
  return (
    <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
      {users.map((user) => (
        <li
          key={user.id}
          className="flex items-center justify-between gap-4 px-4 py-3"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-gray-900">
              {user.email ?? "(no email)"}
            </div>
            <div className="text-xs text-gray-500">
              {dateLabel} {new Date(user.date).toLocaleString()}
            </div>
          </div>
          <button
            type="button"
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${actionClass}`}
            onClick={() => onAction(user.id)}
          >
            {actionLabel}
          </button>
        </li>
      ))}
    </ul>
  );
}
