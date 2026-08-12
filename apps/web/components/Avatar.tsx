"use client";

type AvatarProps = {
  name: string;
  url?: string | null;
  online?: boolean;
  size?: "sm" | "md";
};

export function Avatar({ name, url, online, size = "md" }: AvatarProps) {
  const dim = size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="relative shrink-0">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          className={`${dim} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${dim} flex items-center justify-center rounded-full bg-ebano-surface text-ebano-accent ring-1 ring-white/10`}
        >
          {initials || "?"}
        </div>
      )}
      {online ? (
        <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full bg-ebano-online ring-2 ring-ebano-bg" />
      ) : null}
    </div>
  );
}
