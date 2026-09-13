// One base URL for every fetch: the Vite proxy in dev, the backend on 8000 in a static build, VITE_API_URL to override.
export const API = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '/api' : 'http://localhost:8000');
