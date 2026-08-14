"use client";

import { useEffect, useState } from "react";
import { mediaSrc } from "@/lib/media";

type AvatarProps = {
  name: string;
  url?: string | null;
  online?: boolean;
  size?: "sm" | "md" | "lg";
};

export function Avatar({ name, url, online, size = "md" }: AvatarProps) {
  const src = mediaSrc(url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const dim =
    size === "sm"
      ? "h-9 w-9 text-xs"
      : size === "lg"
        ? "h-16 w-16 text-lg"
        : "h-11 w-11 text-sm";
  const onlineDot =
    size === "lg" ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const fallback = (
    <div
      className={`${dim} flex items-center justify-center rounded-full bg-ebano-surface text-ebano-accent ring-1 ring-ebano-accent/50`}
    >
      {initials || "?"}
    </div>
  );

  return (
    <div className="relative shrink-0">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          crossOrigin="use-credentials"
          onError={() => setFailed(true)}
          className={`${dim} rounded-full object-cover ring-1 ring-ebano-accent/40`}
        />
      ) : (
        fallback
      )}
      {online ? (
        <span
          className={`absolute right-0 bottom-0 ${onlineDot} rounded-full bg-ebano-online ring-2 ring-ebano-bg`}
        />
      ) : null}
    </div>
  );
}
