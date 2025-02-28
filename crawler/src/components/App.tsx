import React, { useState, useEffect } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import type { CrawlJob } from "../types";
import { CrawlForm } from "./CrawlForm";
import { CrawlTable } from "./CrawlTable";
import { LoginScreen } from "./LoginScreen";
import { useLocalStorage } from "@uidotdev/usehooks";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 5, // 5 seconds
      gcTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function CrawlApp() {
  const [apiToken, setApiToken] = useLocalStorage("yesApiToken", "");

  const {
    data: jobs = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["crawlJobs"],
    queryFn: async () => {
      const response = await fetch("/api/crawls", {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      });
      if (!response.ok) {
        // If the API token is invalid, log out
        if (response.status === 401) {
          setApiToken("");
          return [];
        }
        throw new Error("Failed to fetch crawl jobs");
      }
      return response.json() as Promise<CrawlJob[]>;
    },
    refetchInterval: 5000, // auto-refresh every 5 seconds
    enabled: !!apiToken, // Only run this query when logged in
  });

  const handleLogin = (token: string) => {
    setApiToken(token);
  };

  const handleLogout = () => {
    setApiToken("");
  };

  if (!apiToken) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      <div className="header">
        <h1>Web Archive Crawls</h1>
        <button onClick={handleLogout} className="btn btn-logout">
          Logout
        </button>
      </div>
      <p>Click on a completed archive to open it in ReplayWeb.page</p>

      <CrawlForm refreshCrawlData={refetch} apiToken={apiToken} />
      <CrawlTable jobs={jobs} isLoading={isLoading} />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CrawlApp />
    </QueryClientProvider>
  );
}
