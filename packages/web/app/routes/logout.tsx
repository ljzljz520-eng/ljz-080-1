import { ActionFunctionArgs, redirect } from "@remix-run/node";
import { sessionCookie } from "~/lib/api";

export async function action({}: ActionFunctionArgs) {
  return redirect("/login", {
    headers: { "Set-Cookie": await sessionCookie.serialize("", { maxAge: 0 }) },
  });
}
export async function loader() {
  return redirect("/login");
}
