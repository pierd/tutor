import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignIn } from "./SignIn";
import { SignOut } from "./SignOut";
import './App.css'

export function App() {
  return (
    <>
      <AuthLoading>
        <div>Authenticating...</div>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <SignOut />
        <Content />
      </Authenticated>
    </>
  );
}

function Content() {
  /* render signed-in content */
  return <div>TODO</div>;
}
