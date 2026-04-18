import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useSessionStore } from "./store/session";
import Admin from "./pages/Admin";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Sessions from "./pages/Sessions";
import Skills from "./pages/Skills";

function RequireUser({ children }: { children: React.ReactNode }) {
  const username = useSessionStore((s) => s.username);
  if (!username) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/chat"
          element={
            <RequireUser>
              <Chat />
            </RequireUser>
          }
        />
        <Route
          path="/sessions"
          element={
            <RequireUser>
              <Sessions />
            </RequireUser>
          }
        />
        <Route
          path="/skills"
          element={
            <RequireUser>
              <Skills />
            </RequireUser>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireUser>
              <Admin />
            </RequireUser>
          }
        />
        <Route path="/" element={<Navigate to="/chat" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
