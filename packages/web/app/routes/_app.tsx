import { Outlet, Link, Form, useRouteLoaderData } from "@remix-run/react";
import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { getUser, User } from "~/lib/api";
import { ROLE_LABELS } from "~/lib/format";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  if (!user) throw redirect("/login");
  return { user };
}

export function useUser(): User {
  return useRouteLoaderData<typeof loader>("routes/_app")!.user;
}

const NAV: Record<string, { to: string; label: string }[]> = {
  customer: [
    { to: "/dashboard", label: "我的借测" },
    { to: "/applications/new", label: "申请样机" },
  ],
  sales: [
    { to: "/dashboard", label: "审核队列" },
  ],
  legal: [
    { to: "/dashboard", label: "合规队列" },
  ],
  warehouse: [
    { to: "/dashboard", label: "出入库任务" },
  ],
};

export default function AppLayout() {
  const { user } = useRouteLoaderData<typeof loader>("routes/_app")!;
  return (
    <>
      <header className="topbar">
        <Link to="/dashboard" className="brand">🌍 跨境样品借测系统</Link>
        <div className="who">
          <span>{user.name}</span>
          <span className="role-tag">{ROLE_LABELS[user.role]}</span>
          <Form method="post" action="/logout">
            <button className="btn secondary" style={{ padding: "4px 12px" }}>退出</button>
          </Form>
        </div>
      </header>
      <div className="container">
        <Outlet />
      </div>
    </>
  );
}
