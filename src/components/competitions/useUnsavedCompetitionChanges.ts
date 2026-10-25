import { useEffect } from "react";
import { useRouter } from "next/router";
/** Cancel internal links before Next handles them; never throw into the runtime overlay. */
export function useUnsavedCompetitionChanges(dirty: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!dirty) return;
    const confirm = () =>
      window.confirm("ยังมีข้อมูลที่ไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?");
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.download ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      const next = new URL(anchor.href, window.location.href);
      if (
        next.origin !== window.location.origin ||
        (next.pathname === window.location.pathname &&
          next.search === window.location.search)
      )
        return;
      if (!confirm()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    router.beforePopState(() => {
      if (confirm()) return true;
      void router.replace(router.asPath, undefined, {
        shallow: true,
        scroll: false,
      });
      return false;
    });
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      router.beforePopState(() => true);
    };
  }, [dirty, router]);
}
