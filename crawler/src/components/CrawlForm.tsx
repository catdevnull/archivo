import React, { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ky from "ky";
import type { CrawlJob } from "../types";

interface CrawlFormProps {
  refreshCrawlData: () => void;
  apiToken: string;
}

export function CrawlForm({ refreshCrawlData, apiToken }: CrawlFormProps) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const queryClient = useQueryClient();

  const submitCrawlMutation = useMutation({
    mutationFn: async ({ url, token }: { url: string; token: string }) => {
      const response = await ky.post("/api/crawls", {
        json: { urls: [url] },
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.json() as Promise<CrawlJob>;
    },
    onSuccess: (data) => {
      setStatus(`Crawl job started! Job ID: ${data.id}`);
      setUrl("");

      queryClient.invalidateQueries({ queryKey: ["crawlJobs"] });
    },
    onError: (error: Error) => {
      setStatus(`Error: ${error.message}`);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setStatus("Submitting crawl job...");
    submitCrawlMutation.mutate({ url, token: apiToken });
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <h2>Start a New Crawl</h2>
      <div className="form-group">
        <label htmlFor="url" className="form-label">
          URL to Crawl:
        </label>
        <input
          type="url"
          id="url"
          name="url"
          className="form-control"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
        />
      </div>
      <button
        type="submit"
        className="btn"
        disabled={submitCrawlMutation.isPending}
      >
        {submitCrawlMutation.isPending ? "Submitting..." : "Start Crawl"}
      </button>
      <p
        id="formStatus"
        className={status.includes("Error") ? "status-error" : "status-info"}
      >
        {status}
      </p>
    </form>
  );
}
