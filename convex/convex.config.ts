import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";

const app = defineApp();
// Coach chat threads and messages (convex/coach.ts).
app.use(agent);
export default app;
