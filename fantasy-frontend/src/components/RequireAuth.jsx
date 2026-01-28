// src/components/RequireAuth.jsx
import { Navigate, useLocation } from "react-router-dom";
import { tokenStore } from "../api/api";

export default function RequireAuth({ children }) {
  const location = useLocation();

  // Read token every render (and rely on navigation to trigger rerender)
  const token = tokenStore.get();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
