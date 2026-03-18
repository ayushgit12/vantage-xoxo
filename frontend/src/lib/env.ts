const DEFAULT_BACKEND_URL = "http://localhost:8000";

export const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BACKEND_URL).replace(/\/$/, "");