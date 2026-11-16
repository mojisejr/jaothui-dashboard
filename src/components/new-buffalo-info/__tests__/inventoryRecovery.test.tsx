import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { type PropsWithChildren } from "react";
import { retryInventory, inventoryRetryDelay } from "../inventoryRecovery";
test("retry only allowlisted transient read failures, never authorization, validation or unknown errors", () => {
  for (const message of [
    "INVENTORY_ACQUISITION_TIMEOUT",
    "INVENTORY_TRANSACTION_EXPIRED",
    "INVENTORY_READ_UNAVAILABLE",
  ]) {
    expect(retryInventory(0, { message })).toBe(true);
    expect(retryInventory(1, { data: { diagnostic: { code: message } } })).toBe(
      true,
    );
    expect(retryInventory(2, { message })).toBe(false);
  }
  for (const message of [
    "UNAUTHORIZED",
    "FORBIDDEN",
    "INVENTORY_READ_FAILED",
    "INTERNAL_ERROR",
    "CLIENT_RESPONSE_UNAVAILABLE",
    "network disconnected",
  ])
    expect(retryInventory(0, { message })).toBe(false);
  expect([0, 1, 2].map(inventoryRetryDelay)).toEqual([1000, 2000, 2000]);
});
test.each([false, true])(
  "React Query performs at most three reads, persistent=%s",
  async (persistent) => {
    jest.useFakeTimers();
    const client = new QueryClient();
    const read = jest
      .fn()
      .mockRejectedValue({ message: "INVENTORY_ACQUISITION_TIMEOUT" });
    if (!persistent)
      read
        .mockRejectedValueOnce({ message: "INVENTORY_READ_UNAVAILABLE" })
        .mockRejectedValueOnce({ message: "INVENTORY_TRANSACTION_EXPIRED" })
        .mockResolvedValueOnce([]);
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const page = renderHook(
      () =>
        useQuery({
          queryKey: ["inventory"],
          queryFn: read,
          retry: retryInventory,
          retryDelay: inventoryRetryDelay,
        }),
      { wrapper },
    );
    try {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3100);
      });
      await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60000);
      });
      expect(read).toHaveBeenCalledTimes(3);
      expect(
        persistent
          ? page.result.current.isError
          : page.result.current.isSuccess,
      ).toBe(true);
    } finally {
      page.unmount();
      client.clear();
      jest.useRealTimers();
    }
  },
);
