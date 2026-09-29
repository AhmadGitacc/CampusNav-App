import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/**
 * Tracks connectivity. Starts optimistic (`true`) so the offline banner never
 * flashes on a cold start before NetInfo reports.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let active = true;

    NetInfo.fetch().then((state) => {
      if (active) setOnline(!!state.isConnected);
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return online;
}
