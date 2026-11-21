import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginPage from "./login/page";

/** The front door: sign in, create an account, or jump into the demo as any role. */
export default async function Home() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <LoginPage />;
}
