export const destinationAfterLogin = (loggedUser, search = "", fallback = "/") => {
  if (!["family", "player"].includes(loggedUser?.role)) return fallback;
  return loggedUser.role === "family" && new URLSearchParams(search).get("activated") === "1"
    ? "/portal?onboarding=1"
    : "/portal";
};
