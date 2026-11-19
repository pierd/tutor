import { useMutation } from "convex/react";
import { useQuery } from "../lib/useQuery";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Row = { _id: Id<"users">; email: string | null; date: number };

const buttonClass = "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors";

// Admin tool: let people in from the wishlist.
export function WishlistAdmin() {
  const { t } = useTranslation();
  const waiting = useQuery(api.wishlist.waiting);
  const approved = useQuery(api.wishlist.approved);
  const approve = useMutation(api.wishlist.approve);
  const revoke = useMutation(api.wishlist.revoke);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("wishlist.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("wishlist.intro")}</p>
      </div>
      <UserSection
        title={t("wishlist.waiting")}
        rows={waiting}
        empty={t("wishlist.noneWaiting")}
        dateKey="wishlist.joined"
        action={t("wishlist.approve")}
        actionClass="bg-gray-900 text-white hover:bg-gray-800"
        onAction={(row) => void approve({ userId: row._id })}
      />
      <UserSection
        title={t("wishlist.approved")}
        rows={approved}
        empty={t("wishlist.noneApproved")}
        dateKey="wishlist.approvedAt"
        action={t("wishlist.revoke")}
        actionClass="bg-red-50 text-red-600 hover:bg-red-100"
        onAction={(row) => {
          if (confirm(t("wishlist.confirmRevoke", { email: row.email ?? t("wishlist.noEmail") }))) {
            void revoke({ userId: row._id });
          }
        }}
      />
    </div>
  );
}

function UserSection({
  title,
  rows,
  empty,
  dateKey,
  action,
  actionClass,
  onAction,
}: {
  title: string;
  rows: Row[] | undefined;
  empty: string;
  dateKey: "wishlist.joined" | "wishlist.approvedAt";
  action: string;
  actionClass: string;
  onAction: (row: Row) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">
        {title}
        {rows && rows.length > 0 && <span className="ml-1 font-normal text-gray-500">({rows.length})</span>}
      </h2>
      {rows === undefined ? null : rows.length === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {rows.map((row) => (
            <li key={row._id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">{row.email ?? t("wishlist.noEmail")}</div>
                <div className="text-xs text-gray-500">
                  {t(dateKey, { date: new Date(row.date).toLocaleString(i18n.language) })}
                </div>
              </div>
              <button type="button" className={`${buttonClass} ${actionClass}`} onClick={() => onAction(row)}>
                {action}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
