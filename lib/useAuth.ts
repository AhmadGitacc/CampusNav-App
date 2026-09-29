import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "@/components/AuthProvider";

/**
 * Reads the session shared by <AuthProvider>.
 * @throws when used outside the provider (mount AuthProvider in app/_layout.tsx).
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return context;
}
