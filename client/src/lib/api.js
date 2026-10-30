// Thin fetch wrapper: JSON in/out, Bearer token from localStorage, error text thrown.
const TOKEN_KEY = "driveright.token";
const USER_KEY = "driveright.user";
const API_ORIGIN = String(import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getCachedUser = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
};
export const saveAuth = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};
export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_ORIGIN}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error */ }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const naira = (kobo) => "₦" + (kobo / 100).toLocaleString("en-NG");
