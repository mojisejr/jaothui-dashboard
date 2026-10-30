import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../auth.context";
const mockReplace = jest.fn(async () => true);
const mockRouter = { replace: mockReplace, asPath: "", isReady: true };
const mockMutation = {
  data: undefined as string | undefined,
  isPending: false,
  isSuccess: false,
  isError: false,
  mutate: jest.fn(),
  error: null,
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("~/utils/api", () => ({
  api: { auth: { login: { useMutation: () => mockMutation } } },
}));
const pass =
  "/dashboard/competitions/check-in/v1.ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
function Child() {
  const auth = useAuth();
  return (
    <>
      <span>{auth.isAuth ? "authenticated" : "login needed"}</span>
      <button onClick={() => auth.logout()}>logout</button>
    </>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  mockMutation.data = undefined;
  mockMutation.isSuccess = false;
  mockRouter.asPath = pass;
  mockRouter.isReady = true;
});
it("preserves a QR destination through unauthenticated redirect and consumes it only after successful login", async () => {
  const view = render(
    <AuthProvider>
      <Child />
    </AuthProvider>,
  );
  expect(mockReplace).toHaveBeenCalledWith("/");
  expect(screen.getByText("login needed")).toBeVisible();
  mockRouter.asPath = "/";
  view.rerender(
    <AuthProvider>
      <Child />
    </AuthProvider>,
  );
  mockMutation.data = "new-jwt";
  mockMutation.isSuccess = true;
  view.rerender(
    <AuthProvider>
      <Child />
    </AuthProvider>,
  );
  await waitFor(() => expect(mockReplace).toHaveBeenLastCalledWith(pass));
  expect(localStorage.getItem("jaothui-jwt")).toBe("new-jwt");
  expect(sessionStorage.getItem("jaothui-competition-return")).toBeNull();
});
it("waits for router hydration before redirecting and keeps an existing staff session on the QR route", () => {
  localStorage.setItem("jaothui-jwt", "existing-jwt");
  mockRouter.isReady = false;
  const view = render(
    <AuthProvider>
      <Child />
    </AuthProvider>,
  );
  expect(mockReplace).not.toHaveBeenCalled();
  mockRouter.isReady = true;
  view.rerender(
    <AuthProvider>
      <Child />
    </AuthProvider>,
  );
  expect(screen.getByText("authenticated")).toBeVisible();
  expect(mockReplace).not.toHaveBeenCalled();
});
it("keeps the normal dashboard login destination when no safe competition destination was remembered", async () => {
  mockRouter.asPath = "/";
  sessionStorage.setItem("jaothui-competition-return", "//evil.example");
  const view = render(
    <AuthProvider>
      <Child />
    </AuthProvider>,
  );
  mockMutation.data = "new-jwt";
  mockMutation.isSuccess = true;
  view.rerender(
    <AuthProvider>
      <Child />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(mockReplace).toHaveBeenLastCalledWith("/dashboard"),
  );
});
it("clears both auth and remembered destination on explicit logout", () => {
  localStorage.setItem("jaothui-jwt", "existing-jwt");
  sessionStorage.setItem("jaothui-competition-return", pass);
  render(
    <AuthProvider>
      <Child />
    </AuthProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "logout" }));
  expect(localStorage.getItem("jaothui-jwt")).toBeNull();
  expect(sessionStorage.getItem("jaothui-competition-return")).toBeNull();
  expect(mockReplace).toHaveBeenLastCalledWith("/");
});
