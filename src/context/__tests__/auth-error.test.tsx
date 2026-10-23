import { render, screen } from "@testing-library/react";
import { AuthProvider } from "../auth.context";
const replace = jest.fn(async () => undefined);
const mutation = {
  data: undefined,
  isPending: false,
  isSuccess: false,
  isError: true,
  mutate: jest.fn(),
  error: { data: undefined },
};
jest.mock("next/router", () => ({ useRouter: () => ({ replace }) }));
jest.mock("~/utils/api", () => ({
  api: { auth: { login: { useMutation: () => mutation } } },
}));
test("a non-JSON transport failure during shared login shows a retry message without crashing the application", () => {
  const alert = jest.spyOn(window, "alert").mockImplementation(() => undefined);
  render(
    <AuthProvider>
      <span>Login remains available</span>
    </AuthProvider>,
  );
  expect(screen.getByText("Login remains available")).toBeInTheDocument();
  expect(alert).toHaveBeenCalledWith(
    "ติดต่อระบบเข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง",
  );
  expect(replace).toHaveBeenCalledWith("/");
  alert.mockRestore();
});
