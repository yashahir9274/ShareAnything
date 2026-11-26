import { initials, type ChatUser } from "@/lib/chat";

export function Avatar({ user, size = "md", ring = false }: { user: ChatUser; size?: "sm" | "md"; ring?: boolean }) {
  return (
    <span
      title={user.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${
        size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"
      } ${ring ? "ring-2 ring-surface" : ""}`}
      style={{ backgroundColor: user.color }}
    >
      {initials(user.name)}
    </span>
  );
}

/** Overlapping avatars of who's here, with a "+n" for the rest. */
export function AvatarStack({ users, max = 4, size = "sm" }: { users: ChatUser[]; max?: number; size?: "sm" | "md" }) {
  if (!users.length) return null;
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="inline-flex items-center" aria-label={`${users.length} online: ${users.map((u) => u.name).join(", ")}`}>
      {shown.map((user, index) => (
        <span key={user.id} className={index ? "-ml-2" : ""}>
          <Avatar user={user} size={size} ring />
        </span>
      ))}
      {rest > 0 ? (
        <span
          className={`-ml-2 inline-flex items-center justify-center rounded-full bg-strong font-semibold text-on-strong ring-2 ring-surface ${
            size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"
          }`}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
