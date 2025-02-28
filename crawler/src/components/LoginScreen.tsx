import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CrawlJob } from "../types";
import { CrawlTable } from "./CrawlTable";

interface LoginScreenProps {
  onLogin: (apiToken: string) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [apiToken, setApiToken] = useState(() => {
    return localStorage.getItem("apiToken") || "";
  });

  const { data: publicCrawls = [], isLoading: isLoadingPublicCrawls } =
    useQuery({
      queryKey: ["publicJmileiCrawls"],
      queryFn: async () => {
        const response = await fetch("/api/public/jmilei-crawls");
        if (!response.ok) {
          throw new Error("Failed to fetch public crawls");
        }
        return response.json() as Promise<CrawlJob[]>;
      },
      refetchInterval: 30000, // refresh every 30 seconds
    });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiToken.trim()) {
      localStorage.setItem("apiToken", apiToken);
      onLogin(apiToken);
    }
  };

  const handleApiTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiToken(e.target.value);
  };

  return (
    <div className="login-container">
      <h1>Web Archive Crawler</h1>

      <section>
        <h2>Recent Public Crawls of @jmilei on X.com</h2>
        <p>
          These are the 10 most recent crawls of Javier Milei's X.com profile.
        </p>
        <CrawlTable jobs={publicCrawls} isLoading={isLoadingPublicCrawls} />
      </section>

      <section>
        <h2>Login to Access Full Features</h2>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="apiToken" className="form-label">
              API Token:
            </label>
            <input
              type="password"
              id="apiToken"
              name="apiToken"
              className="form-control"
              required
              value={apiToken}
              onChange={handleApiTokenChange}
              placeholder="Enter your API token"
            />
          </div>
          <button type="submit" className="btn">
            Login
          </button>
        </form>
      </section>
    </div>
  );
}
