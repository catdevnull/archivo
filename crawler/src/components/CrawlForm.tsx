import React, { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ky from "ky";
import type { CrawlJob } from "../types";

interface CrawlFormProps {
  refreshCrawlData: () => void;
  apiToken: string;
}

export function CrawlForm({ refreshCrawlData, apiToken }: CrawlFormProps) {
  const [urlInput, setUrlInput] = useState("");
  const [extractedUrls, setExtractedUrls] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    // Extract URLs from input text
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = urlInput.match(urlRegex) || [];
    setExtractedUrls(matches);
  }, [urlInput]);

  const submitCrawlMutation = useMutation({
    mutationFn: async ({ urls, token }: { urls: string[]; token: string }) => {
      const response = await ky.post("/api/crawls", {
        json: { urls },
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.json() as Promise<CrawlJob>;
    },
    onSuccess: (data) => {
      setStatus(`Crawl job started! Job ID: ${data.id}`);
      setUrlInput("");
      setExtractedUrls([]);

      queryClient.invalidateQueries({ queryKey: ["crawlJobs"] });
    },
    onError: (error: Error) => {
      setStatus(`Error: ${error.message}`);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (extractedUrls.length === 0) {
      setStatus("Error: No valid URLs found");
      return;
    }
    setStatus("Submitting crawl job...");
    submitCrawlMutation.mutate({ urls: extractedUrls, token: apiToken });
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <h2>Start a New Crawl</h2>
      <div className="form-group">
        <label htmlFor="url" className="form-label">
          URLs to Crawl:
        </label>
        <textarea
          id="url"
          name="url"
          className="form-control"
          required
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Paste URLs here (https://example.com)"
          rows={5}
        />
      </div>
      {extractedUrls.length > 0 && (
        <div className="form-group">
          <label className="form-label">
            Detected URLs ({extractedUrls.length}):
          </label>
          <ul className="url-list">
            {extractedUrls.map((url, index) => (
              <li key={index}>{url}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="submit"
        className="btn"
        disabled={submitCrawlMutation.isPending || extractedUrls.length === 0}
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
