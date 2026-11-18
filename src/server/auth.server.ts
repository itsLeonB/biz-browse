import { auth } from "@clerk/tanstack-react-start/server";

export async function isAdmin() {
  const { isAuthenticated, userId } = await auth();
  const ids = (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim());
  return Boolean(isAuthenticated && userId && ids.includes(userId));
}
