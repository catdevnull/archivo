import React from "react";
import type { CrawlJob } from "../types";
import { useQuery } from "@tanstack/react-query";

interface CrawlTableProps {
  jobs: CrawlJob[];
  isLoading: boolean;
}

export function CrawlTable({ jobs, isLoading }: CrawlTableProps) {
  const { data: info } = useQuery({
    queryKey: ["info"],
    queryFn: async () => {
      const response = await fetch("/api/info");
      return response.json();
    },
  });

  if (isLoading && jobs.length === 0) {
    return (
      <table>
        <thead>
          <tr>
            <th>Archive ID</th>
            <th>URLs</th>
            <th>Status</th>
            <th>Created At</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={4}>Loading...</td>
          </tr>
        </tbody>
      </table>
    );
  }

  const url = (obj: CrawlJob) =>
    obj.status === "completed"
      ? `https://${info.S3_BUCKET}.${info.S3_ENDPOINT?.replace(
          "https://",
          ""
        )}/crawls/${obj.id}/${obj.id}.wacz`
      : null;

  return (
    <table>
      <thead>
        <tr>
          <th>Archive ID</th>
          <th>URLs</th>
          <th>Status</th>
          <th>Created At</th>
        </tr>
      </thead>
      <tbody>
        {jobs.length === 0 ? (
          <tr>
            <td colSpan={4}>No archives found</td>
          </tr>
        ) : (
          jobs.map((job) => {
            const waczUrl = url(job);
            return (
              <tr key={job.id}>
                <td>
                  {waczUrl ? (
                    <a
                      href={`https://replayweb.page/?source=${encodeURIComponent(
                        waczUrl
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {job.id}
                    </a>
                  ) : (
                    job.id
                  )}
                </td>
                <td>{job.urls.join(", ")}</td>
                <td className={`status-${job.status}`}>{job.status}</td>
                <td className="date">{job.createdAt}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
