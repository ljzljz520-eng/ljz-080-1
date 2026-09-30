import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/lib/api";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  throw redirect(user ? "/dashboard" : "/login");
}
