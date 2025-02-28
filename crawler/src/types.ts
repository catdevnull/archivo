export interface CrawlJob {
  id: string;
  urls: string[];
  status: "pending" | "working" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
