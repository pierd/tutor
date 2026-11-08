import { SignOut } from "./SignOut";

export function WishlistPending({ email }: { email: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          You're on the wishlist
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          Thanks for your interest in Tutor! We're letting people in gradually.
          We'll let you know
          {email ? (
            <>
              {" "}
              at <span className="font-medium text-gray-900">{email}</span>
            </>
          ) : null}{" "}
          as soon as your account is approved.
        </p>
        <SignOut />
      </div>
    </div>
  );
}
