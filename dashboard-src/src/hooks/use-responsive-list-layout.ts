import * as React from "react";

const DESKTOP_QUERY = "(min-width: 768px)";

export function useResponsiveListLayout() {
  const [desktop, setDesktop] = React.useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia(DESKTOP_QUERY).matches,
  );

  React.useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);

  return desktop ? "desktop" : "mobile";
}
