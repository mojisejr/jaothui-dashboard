jest.mock("~/env", () => ({
  env: {
    JAOTHUI_NEWS_ADMIN_API_BASE_URL: "http://localhost:3000",
    JAOTHUI_NEWS_ADMIN_API_KEY: "test-news-admin-api-key",
  },
}));

import {
  newsAdminApiClient,
  toNewsAdminTRPCError,
  type NewsEventAdminItem,
} from "../news-admin-api-client";

const mockItem: NewsEventAdminItem = {
  id: "news-event-1",
  title: "ข่าวทดสอบ",
  slug: "test-news",
  type: "news",
  status: "draft",
  featured: false,
  priority: 100,
  publishedAt: null,
  eventStartAt: null,
  eventEndAt: null,
  location: null,
  excerpt: "รายละเอียดข่าว",
  coverImageUrl: null,
  coverImageAssetRef: null,
  ctaLabel: null,
  ctaUrl: null,
};

class TestHeaders {
  private readonly values = new Map<string, string>();

  constructor(init?: TestHeaders | [string, string][] | Record<string, string>) {
    if (init instanceof TestHeaders) {
      init.values.forEach((value, key) => this.values.set(key, value));
      return;
    }

    if (Array.isArray(init)) {
      init.forEach(([key, value]) => this.set(key, value));
      return;
    }

    if (init && typeof init === "object") {
      Object.entries(init).forEach(([key, value]) => this.set(key, value));
    }
  }

  get(name: string) {
    return this.values.get(name.toLowerCase()) ?? null;
  }

  set(name: string, value: string) {
    this.values.set(name.toLowerCase(), value);
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("newsAdminApiClient", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    global.Headers = TestHeaders as unknown as typeof Headers;
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("calls the frontend admin API with the server bridge bearer token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [mockItem] }, 200),
    );

    const response = await newsAdminApiClient.list();

    expect(response.items).toEqual([mockItem]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("http://localhost:3000/api/admin/news-events");
    expect(init.headers).toBeInstanceOf(Headers);
    expect((init.headers as Headers).get("Authorization")).toMatch(/^Bearer .+/);
    expect((init.headers as Headers).get("Accept")).toBe("application/json");
  });

  it("sends JSON mutation payloads without exposing the API key in the body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ item: mockItem }, 201),
    );

    await newsAdminApiClient.create({
      title: mockItem.title,
      slug: mockItem.slug,
      type: "news",
      status: "draft",
      featured: false,
      priority: 100,
      publishedAt: null,
      excerpt: mockItem.excerpt,
      ctaUrl: "/news",
    });

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Authorization")).toMatch(/^Bearer .+/);
    expect(init.body).toContain('"title":"ข่าวทดสอบ"');
    expect(init.body).not.toContain("JAOTHUI_NEWS_ADMIN_API_KEY");
  });

  it("maps frontend validation failures to user-safe tRPC bad requests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "VALIDATION_ERROR",
          message: "Cannot publish news event: missing publishedAt",
        },
        400,
      ),
    );

    try {
      await newsAdminApiClient.publish("news-event-1");
      throw new Error("Expected publish to fail");
    } catch (error) {
      expect(error).toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
      const trpcError = toNewsAdminTRPCError(error);
      expect(trpcError.code).toBe("BAD_REQUEST");
      expect(trpcError.message).toBe("Cannot publish news event: missing publishedAt");
    }
  });

  it("uploads cover images through the raw upload route with filename query", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          asset: { assetRef: "image-asset-1", url: "https://cdn.example/cover.jpg" },
        },
        200,
      ),
    );

    const response = await newsAdminApiClient.uploadCover({
      filename: "cover.jpg",
      contentType: "image/jpeg",
      base64: Buffer.from("image").toString("base64"),
    });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "http://localhost:3000/api/admin/news-events/upload-cover?filename=cover.jpg",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Content-Type")).toBe("image/jpeg");
    expect(response.asset.assetRef).toBe("image-asset-1");
  });
});
