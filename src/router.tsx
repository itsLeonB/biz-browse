import { createRouter, defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    parseSearch: (search) => {
      const parsed: Record<string, unknown> = defaultParseSearch(search);
      const params = new URLSearchParams(search);
      for (const key of ["category", "city", "minPrice", "maxPrice"]) {
        if (params.has(key)) parsed[key] = params.get(key);
      }
      return parsed;
    },
    stringifySearch: (search) => {
      const params = new URLSearchParams(defaultStringifySearch(search));
      for (const key of ["category", "city", "minPrice", "maxPrice"]) {
        if (typeof search[key] === "string") params.set(key, search[key]);
      }
      const result = params.toString();
      return result ? `?${result}` : "";
    },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
