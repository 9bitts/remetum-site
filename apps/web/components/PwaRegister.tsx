"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push";

export function PwaRegister() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
