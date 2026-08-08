import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  HeadContent,
  Link,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-4"
      aria-labelledby="not-found-title"
    >
      <div className="max-w-md text-center">
        <h1 id="not-found-title" className="text-7xl font-bold text-foreground">
          404
        </h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          페이지를 찾을 수 없습니다
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          요청한 페이지가 없거나 주소가 변경되었습니다.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            홈으로 가기
          </Link>
        </div>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-4"
      role="alert"
      aria-live="assertive"
      aria-labelledby="route-error-title"
    >
      <div className="max-w-md text-center">
        <h1
          id="route-error-title"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          페이지를 불러오지 못했습니다
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          일시적인 오류가 발생했습니다. 다시 시도하거나 홈으로 이동해 주세요.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            다시 시도
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            홈으로 가기
          </a>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        {
          name: "description",
          content:
            "미국 주식의 돈이 어디로 움직였는지 데이터로 읽어드립니다. 거래대금과 점유율 변화를 바탕으로 시장의 관심 이동을 확인하세요.",
        },
        { name: "author", content: "BVT Money Flow" },
        {
          property: "og:title",
          content: "미국 주식의 돈이 어디로 움직였는지 | BVT Money Flow",
        },
        {
          property: "og:description",
          content:
            "미국 주식의 돈이 어디로 움직였는지 데이터로 읽어드립니다.",
        },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "BVT Money Flow" },
        { property: "og:url", content: "https://www.bvtmoneyflow.xyz/" },
        {
          property: "og:image",
          content: "https://www.bvtmoneyflow.xyz/og-bvt-money-flow.png",
        },
        { name: "twitter:card", content: "summary_large_image" },
        {
          name: "twitter:title",
          content: "미국 주식의 돈이 어디로 움직였는지 | BVT Money Flow",
        },
        {
          name: "twitter:description",
          content:
            "미국 주식의 돈이 어디로 움직였는지 데이터로 읽어드립니다.",
        },
        {
          name: "twitter:image",
          content: "https://www.bvtmoneyflow.xyz/og-bvt-money-flow.png",
        },
      ],
    }),
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <HeadContent />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="bottom-center" richColors closeButton />
    </QueryClientProvider>
  );
}
