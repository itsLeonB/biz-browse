import { auth } from "@clerk/tanstack-react-start/server";

export async function isAdmin() {
  const { isAuthenticated, userId } = await auth();
  const ids = (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim());
  return Boolean(
    isAuthenticated &&
    userId &&
    ids.length === 2 &&
    ids[0] &&
    ids[1] &&
    ids[0] !== ids[1] &&
    ids.includes(userId),
  );
}
