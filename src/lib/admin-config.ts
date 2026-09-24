export const ADMIN_UID =
  process.env.NEXT_PUBLIC_INTERNAL_ADMIN_UID ||
  process.env.INTERNAL_ADMIN_UID ||
  "uGZypGTf0mSh5JHqy3XlErH60CZ2";

// 運営専用画面・お知らせ管理を操作できるUID（旧運営アカウントを含む）
export const ADMIN_UIDS = [ADMIN_UID, "gNDzHTPlzVZK8cOl7ogxQBRvugH2"];
