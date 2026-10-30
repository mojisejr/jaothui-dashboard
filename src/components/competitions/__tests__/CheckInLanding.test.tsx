import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import CheckInLandingPage, {
  getServerSideProps,
} from "~/pages/dashboard/competitions/check-in/[token]";
const mockReplace = jest.fn(async () => true);
const mockToken = "v1.ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
const mockRouteListeners = new Set<() => void>();
const mockRouter = {
  replace: mockReplace,
  query: { token: mockToken },
  isReady: true,
  events: {
    on: (_event: string, listener: () => void) =>
      mockRouteListeners.add(listener),
    off: (_event: string, listener: () => void) =>
      mockRouteListeners.delete(listener),
  },
};
let mockAuth = true;
const mockResolve = {
  mutateAsync: jest.fn(),
  isPending: false,
  error: null as Error | null,
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("~/context/auth.context", () => ({
  useAuth: () => ({ isAuth: mockAuth }),
}));
jest.mock("~/components/competitions/Workspace", () => ({
  Workspace: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Alert: ({ children }: { children: React.ReactNode }) => (
    <p role="alert">{children}</p>
  ),
  button: "button",
}));
jest.mock("~/utils/api", () => ({
  api: { competitions: { resolveCheckIn: { useMutation: () => mockResolve } } },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockRouteListeners.clear();
  mockAuth = true;
  mockRouter.query.token = mockToken;
  mockResolve.error = null;
  mockResolve.mutateAsync.mockResolvedValue({
    checkInVersion: 1,
    eventId: "event1",
    registrationId: "entry1",
  });
});
function deferredPass() {
  let complete!: (value: {
    checkInVersion: 1;
    eventId: string;
    registrationId: string;
  }) => void;
  const promise = new Promise<{
    checkInVersion: 1;
    eventId: string;
    registrationId: string;
  }>((resolve) => {
    complete = resolve;
  });
  return { promise, complete };
}
it("ignores the older token response when a new QR is opened before resolution finishes", async () => {
  const first = deferredPass();
  const second = deferredPass();
  mockResolve.mutateAsync
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const view = render(<CheckInLandingPage />);
  mockRouter.query.token = "v1.SECONDTOKENABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
  view.rerender(<CheckInLandingPage />);
  expect(mockResolve.mutateAsync).toHaveBeenCalledTimes(2);
  await act(async () => {
    first.complete({
      checkInVersion: 1,
      eventId: "old-event",
      registrationId: "old-entry",
    });
  });
  expect(mockReplace).not.toHaveBeenCalled();
  await act(async () => {
    second.complete({
      checkInVersion: 1,
      eventId: "new-event",
      registrationId: "new-entry",
    });
  });
  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith(
    "/dashboard/competitions/new-event/applications/new-entry",
  );
});
it.each(["unmount", "navigation", "logout"] as const)(
  "does not redirect a pending token after %s",
  async (transition) => {
    const pending = deferredPass();
    mockResolve.mutateAsync.mockReturnValueOnce(pending.promise);
    const view = render(<CheckInLandingPage />);
    expect(mockResolve.mutateAsync).toHaveBeenCalledTimes(1);
    if (transition === "unmount") view.unmount();
    else if (transition === "navigation")
      act(() => {
        mockRouteListeners.forEach((listener) => listener());
      });
    else {
      mockAuth = false;
      view.rerender(<CheckInLandingPage />);
    }
    await act(async () => {
      pending.complete({
        checkInVersion: 1,
        eventId: "old-event",
        registrationId: "old-entry",
      });
    });
    expect(mockReplace).not.toHaveBeenCalled();
  },
);
it("resolves the scanned pass once and opens the existing review without a check-in mutation", async () => {
  const view = render(<CheckInLandingPage />);
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith(
      "/dashboard/competitions/event1/applications/entry1",
    ),
  );
  view.rerender(<CheckInLandingPage />);
  expect(mockResolve.mutateAsync).toHaveBeenCalledTimes(1);
  expect(mockResolve.mutateAsync).toHaveBeenCalledWith({ token: mockToken });
});
it("does not resolve before staff authentication or for a malformed QR", () => {
  mockAuth = false;
  const view = render(<CheckInLandingPage />);
  expect(mockResolve.mutateAsync).not.toHaveBeenCalled();
  expect(screen.getByText(/กรุณาเข้าสู่ระบบบัญชีทีมงาน/)).toBeVisible();
  mockAuth = true;
  mockRouter.query.token = "bad/token";
  view.rerender(<CheckInLandingPage />);
  expect(screen.getByRole("alert")).toHaveTextContent("QR ไม่ถูกต้อง");
  expect(mockResolve.mutateAsync).not.toHaveBeenCalled();
});
it("offers an explicit retry after a resolution failure", async () => {
  mockResolve.error = new Error("ไม่พบใบสมัคร กรุณาเปิด QR ใหม่");
  mockResolve.mutateAsync.mockRejectedValue(mockResolve.error);
  render(<CheckInLandingPage />);
  await waitFor(() => expect(mockResolve.mutateAsync).toHaveBeenCalledTimes(1));
  fireEvent.click(
    screen.getByRole("button", { name: "ลองเปิดใบสมัครอีกครั้ง" }),
  );
  await waitFor(() => expect(mockResolve.mutateAsync).toHaveBeenCalledTimes(2));
  expect(mockReplace).not.toHaveBeenCalled();
});
it("sets no-store and no-referrer headers on the token landing response", async () => {
  const setHeader = jest.fn();
  await getServerSideProps({ res: { setHeader } } as unknown as Parameters<
    typeof getServerSideProps
  >[0]);
  expect(setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  expect(setHeader).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
});
