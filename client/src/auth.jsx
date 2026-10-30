import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, getCachedUser, saveAuth, clearAuth } from "./lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getCachedUser());
  const [checking, setChecking] = useState(!!getToken());

  // Re-validate the stored token once on load; drop it if rejected or role changed.
  useEffect(() => {
    if (!getToken()) { setChecking(false); return; }
    api("/auth/me")
      .then((d) => { setUser(d.user); saveAuth(getToken(), d.user); })
      .catch(() => { clearAuth(); setUser(null); })
      .finally(() => setChecking(false));
  }, []);

  const login = async (email, password) => {
    const d = await api("/auth/login", { method: "POST", body: { email, password } });
    saveAuth(d.token, d.user); setUser(d.user);
    return d.user;
  };

  const register = async (form) => {
    const d = await api("/auth/register", { method: "POST", body: form });
    saveAuth(d.token, d.user); setUser(d.user);
    return d.user;
  };

  const logout = () => { clearAuth(); setUser(null); };

  return (
    <AuthContext.Provider value={{ user, checking, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export const homeForRole = (role) => (role ? `/${role}` : "/login");
