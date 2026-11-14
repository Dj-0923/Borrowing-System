"use strict";

const publicAppRoutes = new Set([
  "/request-account",
  "/account-request-status",
]);
const borrowerAssistantRoute = "/borrower-assistant";

function isLocalDevelopmentOrigin(origin) {
  return /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(
    origin,
  );
}

function isAllowedApiRequest({ origin, method, pathname, allowedOrigins }) {
  const isPublicAppRoute = publicAppRoutes.has(pathname);
  const isBorrowerAssistantRoute = pathname === borrowerAssistantRoute;

  if (!origin) {
    return (
      method === "POST" &&
      (isPublicAppRoute || isBorrowerAssistantRoute)
    );
  }
  if (allowedOrigins.has(origin)) return true;
  return (
    isLocalDevelopmentOrigin(origin) &&
    (isPublicAppRoute || isBorrowerAssistantRoute)
  );
}

module.exports = { isAllowedApiRequest };
