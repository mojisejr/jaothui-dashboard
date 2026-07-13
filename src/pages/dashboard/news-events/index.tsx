import {
  Archive,
  CalendarBlank,
  CheckCircle,
  FloppyDisk,
  ImageSquare,
  MagnifyingGlass,
  NewspaperClipping,
  PencilSimpleLine,
  Plus,
  Star,
  UploadSimple,
} from "@phosphor-icons/react";
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import AmbientOrbs from "~/components/ui/AmbientOrbs";
import Header from "~/components/ui/Header";
import { api, type RouterInputs, type RouterOutputs } from "~/utils/api";

type NewsEventItem = RouterOutputs["newsEvents"]["list"]["items"][number];
type NewsEventFormInput = RouterInputs["newsEvents"]["create"];

type StatusFilter = "all" | NewsEventItem["status"];
type TypeFilter = "all" | NewsEventItem["type"];

const MAX_COVER_UPLOAD_BYTES = 4 * 1024 * 1024;

interface FormState {
  id?: string;
  title: string;
  slug: string;
  type: NewsEventItem["type"];
  status: NewsEventItem["status"];
  featured: boolean;
  priority: number;
  publishedAt: string;
  eventStartAt: string;
  eventEndAt: string;
  location: string;
  excerpt: string;
  coverImageUrl: string;
  coverImageAssetRef: string;
  ctaLabel: string;
  ctaUrl: string;
  body: string;
}

const emptyForm = (): FormState => ({
  title: "",
  slug: "",
  type: "news",
  status: "draft",
  featured: false,
  priority: 100,
  publishedAt: toDateTimeLocalValue(new Date().toISOString()),
  eventStartAt: "",
  eventEndAt: "",
  location: "",
  excerpt: "",
  coverImageUrl: "",
  coverImageAssetRef: "",
  ctaLabel: "",
  ctaUrl: "",
  body: "",
});

const statusMeta = {
  draft: {
    label: "ร่าง",
    className: "border-white/10 bg-white/10 text-white",
  },
  published: {
    label: "เผยแพร่",
    className: "border-emerald-400/30 bg-emerald-400/15 text-emerald-200",
  },
  archived: {
    label: "เก็บถาวร",
    className: "border-red-400/30 bg-red-400/15 text-red-200",
  },
} satisfies Record<NewsEventItem["status"], { label: string; className: string }>;

const typeMeta = {
  news: "ข่าว",
  event: "กิจกรรม",
  announcement: "ประกาศ",
} satisfies Record<NewsEventItem["type"], string>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9ก-๙-]/g, "")
    .slice(0, 140);
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toFormState(item: NewsEventItem): FormState {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    type: item.type,
    status: item.status,
    featured: item.featured,
    priority: item.priority,
    publishedAt: toDateTimeLocalValue(item.publishedAt),
    eventStartAt: toDateTimeLocalValue(item.eventStartAt),
    eventEndAt: toDateTimeLocalValue(item.eventEndAt),
    location: item.location ?? "",
    excerpt: item.excerpt,
    coverImageUrl: item.coverImageUrl ?? "",
    coverImageAssetRef: item.coverImageAssetRef ?? "",
    ctaLabel: item.ctaLabel ?? "",
    ctaUrl: item.ctaUrl ?? "",
    body: "",
  };
}

function toMutationInput(form: FormState): NewsEventFormInput {
  return {
    title: form.title.trim(),
    slug: slugify(form.slug),
    type: form.type,
    status: form.status,
    featured: form.featured,
    priority: Number.isFinite(form.priority) ? form.priority : 100,
    publishedAt: fromDateTimeLocalValue(form.publishedAt),
    eventStartAt: form.type === "event" ? fromDateTimeLocalValue(form.eventStartAt) : null,
    eventEndAt: form.type === "event" ? fromDateTimeLocalValue(form.eventEndAt) : null,
    location: form.type === "event" && form.location.trim() ? form.location.trim() : null,
    excerpt: form.excerpt.trim(),
    coverImageAssetRef: form.coverImageAssetRef || null,
    ctaLabel: form.ctaLabel.trim() || null,
    ctaUrl: form.ctaUrl.trim() || null,
    body: form.body.trim() || null,
  };
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? "");
    };
    reader.readAsDataURL(file);
  });
}

function isPublishable(form: FormState) {
  return Boolean(form.title.trim() && form.slug.trim() && form.excerpt.trim() && form.publishedAt);
}

export default function NewsEventsAdminPage() {
  const utils = api.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());

  const newsEventsQuery = api.newsEvents.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const createMutation = api.newsEvents.create.useMutation();
  const updateMutation = api.newsEvents.update.useMutation();
  const publishMutation = api.newsEvents.publish.useMutation();
  const archiveMutation = api.newsEvents.archive.useMutation();
  const uploadMutation = api.newsEvents.uploadCover.useMutation();

  const items = useMemo(
    () => newsEventsQuery.data?.items ?? [],
    [newsEventsQuery.data?.items],
  );
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedItem) {
      setForm(toFormState(selectedItem));
    }
  }, [selectedItem]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        !normalizedQuery ||
        [item.title, item.slug, item.excerpt, item.location ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesType = typeFilter === "all" || item.type === typeFilter;
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [items, query, statusFilter, typeFilter]);

  const refreshList = async () => {
    await utils.newsEvents.list.invalidate();
  };

  const selectNewDraft = () => {
    setSelectedId(null);
    setForm(emptyForm());
  };

  const updateForm = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "title" && !current.id ? { slug: slugify(String(value)) } : {}),
    }));
  };

  const handleSave = async () => {
    const input = toMutationInput(form);
    if (!input.title || !input.slug || !input.excerpt) {
      toast.error("กรอกหัวข้อ, slug และคำโปรยให้ครบก่อนบันทึก");
      return;
    }

    try {
      const response = form.id
        ? await updateMutation.mutateAsync({ id: form.id, data: input })
        : await createMutation.mutateAsync(input);
      await refreshList();
      setSelectedId(response.item.id);
      setForm(toFormState(response.item));
      toast.success("บันทึกข่าวสารแล้ว");
    } catch (error) {
      console.error("Save news event failed", error);
      toast.error("บันทึกข่าวสารไม่สำเร็จ");
    }
  };

  const handlePublish = async () => {
    if (!form.id || !isPublishable(form)) {
      toast.error("ต้องมีหัวข้อ, slug, คำโปรย และวันเผยแพร่ก่อน publish");
      return;
    }

    try {
      const response = await publishMutation.mutateAsync({ id: form.id });
      await refreshList();
      setForm(toFormState(response.item));
      toast.success("เผยแพร่ข่าวสารแล้ว");
    } catch (error) {
      console.error("Publish news event failed", error);
      toast.error("เผยแพร่ไม่สำเร็จ");
    }
  };

  const handleArchive = async () => {
    if (!form.id) return;

    try {
      const response = await archiveMutation.mutateAsync({ id: form.id });
      await refreshList();
      setForm(toFormState(response.item));
      toast.success("เก็บข่าวสารแล้ว");
    } catch (error) {
      console.error("Archive news event failed", error);
      toast.error("เก็บข่าวสารไม่สำเร็จ");
    }
  };

  const handleCoverUpload = async (file: File | undefined) => {
    if (!file) return;

    if (file.size > MAX_COVER_UPLOAD_BYTES) {
      toast.error("รูปปกต้องไม่เกิน 4MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const base64 = await readFileAsBase64(file);
      const response = await uploadMutation.mutateAsync({
        filename: file.name,
        contentType: file.type,
        base64,
      });
      setForm((current) => ({
        ...current,
        coverImageAssetRef: response.asset.assetRef,
        coverImageUrl: response.asset.url ?? current.coverImageUrl,
      }));
      toast.success("อัปโหลดรูปแล้ว");
    } catch (error) {
      console.error("Cover upload failed", error);
      toast.error("อัปโหลดรูปไม่สำเร็จ");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isPublishing = publishMutation.isPending;
  const isArchiving = archiveMutation.isPending;

  return (
    <>
      <Head>
        <title>จัดการข่าวสาร | Jaothui Dashboard</title>
      </Head>
      <div className="relative min-h-screen bg-dark text-white">
        <AmbientOrbs />
        <Header />

        <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
          <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary-orange/30 bg-primary-orange/10 px-3 py-1 text-sm font-medium text-primary-orange-glow">
                <NewspaperClipping weight="duotone" />
                News & Events
              </div>
              <h1 className="text-2xl font-semibold text-white md:text-3xl">
                จัดการข่าวสาร
              </h1>
            </div>

            <button
              type="button"
              onClick={selectNewDraft}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-orange px-4 py-2 text-sm font-semibold text-black transition hover:bg-primary-orange-glow focus:outline-none focus:ring-2 focus:ring-primary-orange/60"
            >
              <Plus weight="bold" />
              สร้างข่าว
            </button>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-4">
              <div className="glass-card rounded-3xl p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px]">
                  <label className="relative block">
                    <MagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/45" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="ค้นหาหัวข้อ, slug, สถานที่"
                      className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-primary-orange/70"
                    />
                  </label>

                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                    className="h-12 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-primary-orange/70"
                  >
                    <option value="all">ทุกสถานะ</option>
                    <option value="draft">ร่าง</option>
                    <option value="published">เผยแพร่</option>
                    <option value="archived">เก็บถาวร</option>
                  </select>

                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                    className="h-12 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-primary-orange/70"
                  >
                    <option value="all">ทุกประเภท</option>
                    <option value="news">ข่าว</option>
                    <option value="event">กิจกรรม</option>
                    <option value="announcement">ประกาศ</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3">
                {newsEventsQuery.isLoading ? (
                  <div className="glass-card rounded-3xl p-8 text-center text-white/70">
                    กำลังโหลดข่าวสาร...
                  </div>
                ) : null}

                {newsEventsQuery.error ? (
                  <div className="rounded-3xl border border-red-400/30 bg-red-400/10 p-5 text-red-100">
                    โหลดข่าวสารไม่สำเร็จ
                  </div>
                ) : null}

                {!newsEventsQuery.isLoading && filteredItems.length === 0 ? (
                  <div className="glass-card rounded-3xl p-8 text-center text-white/70">
                    ไม่พบรายการ
                  </div>
                ) : null}

                {filteredItems.map((item) => {
                  const isSelected = item.id === form.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`glass-card group grid gap-4 rounded-3xl p-4 text-left transition hover:border-primary-orange/50 md:grid-cols-[160px_minmax(0,1fr)] ${
                        isSelected ? "border-primary-orange/60 shadow-orange-glow" : ""
                      }`}
                    >
                      <div className="aspect-video overflow-hidden rounded-xl border border-white/10 bg-black/40">
                        {item.coverImageUrl ? (
                          <div
                            aria-hidden="true"
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${item.coverImageUrl})` }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-white/30">
                            <ImageSquare size={32} weight="duotone" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusMeta[item.status].className}`}
                          >
                            {statusMeta[item.status].label}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-accent-purple/30 bg-accent-purple/15 px-2.5 py-1 text-xs font-medium text-purple-100">
                            {typeMeta[item.type]}
                          </span>
                          {item.featured ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary-orange/30 bg-primary-orange/10 px-2.5 py-1 text-xs font-medium text-primary-orange-glow">
                              <Star size={13} weight="fill" />
                              Featured
                            </span>
                          ) : null}
                        </div>

                        <div>
                          <h2 className="line-clamp-2 break-words text-lg font-semibold text-white">
                            {item.title}
                          </h2>
                          <p className="mt-1 line-clamp-2 break-words text-sm text-white/60">
                            {item.excerpt}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-white/45">
                          <span>Priority {item.priority}</span>
                          <span>{item.slug}</span>
                          {item.publishedAt ? (
                            <span className="inline-flex items-center gap-1">
                              <CalendarBlank />
                              {new Date(item.publishedAt).toLocaleDateString("th-TH")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="glass-card h-fit rounded-3xl p-5 lg:sticky lg:top-28">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {form.id ? "แก้ไขรายการ" : "สร้างรายการ"}
                  </h2>
                  <p className="text-sm text-white/50">
                    {form.id ? form.slug || form.id : "draft"}
                  </p>
                </div>
                <PencilSimpleLine className="text-2xl text-primary-orange-glow" />
              </div>

              <div className="space-y-4">
                <div className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                  {form.coverImageUrl ? (
                    <div
                      aria-hidden="true"
                      className="h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${form.coverImageUrl})` }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/40 transition hover:text-white/70"
                    >
                      <ImageSquare size={42} weight="duotone" />
                      <span className="text-sm">16:9 Cover</span>
                    </button>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => void handleCoverUpload(event.target.files?.[0])}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UploadSimple />
                  {uploadMutation.isPending ? "กำลังอัปโหลด..." : "อัปโหลดรูป"}
                </button>

                <div className="grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-sm text-white/70">หัวข้อ</span>
                    <input
                      value={form.title}
                      onChange={(event) => updateForm("title", event.target.value)}
                      maxLength={120}
                      className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-orange/70"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-sm text-white/70">Slug</span>
                    <input
                      value={form.slug}
                      onChange={(event) => updateForm("slug", slugify(event.target.value))}
                      maxLength={140}
                      className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-orange/70"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-sm text-white/70">คำโปรย</span>
                    <textarea
                      value={form.excerpt}
                      onChange={(event) => updateForm("excerpt", event.target.value)}
                      maxLength={240}
                      rows={3}
                      className="resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-primary-orange/70"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-sm text-white/70">ประเภท</span>
                      <select
                        value={form.type}
                        onChange={(event) => updateForm("type", event.target.value as FormState["type"])}
                        className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-orange/70"
                      >
                        <option value="news">ข่าว</option>
                        <option value="event">กิจกรรม</option>
                        <option value="announcement">ประกาศ</option>
                      </select>
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-sm text-white/70">สถานะ</span>
                      <select
                        value={form.status}
                        onChange={(event) => updateForm("status", event.target.value as FormState["status"])}
                        className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-orange/70"
                      >
                        <option value="draft">ร่าง</option>
                        <option value="published">เผยแพร่</option>
                        <option value="archived">เก็บถาวร</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-sm text-white/70">วันเผยแพร่</span>
                      <input
                        type="datetime-local"
                        value={form.publishedAt}
                        onChange={(event) => updateForm("publishedAt", event.target.value)}
                        className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-orange/70"
                      />
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-sm text-white/70">Priority</span>
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={form.priority}
                        onChange={(event) => updateForm("priority", Number(event.target.value))}
                        className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-orange/70"
                      />
                    </label>
                  </div>

                  <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white">
                    <span className="inline-flex items-center gap-2">
                      <Star className="text-primary-orange-glow" weight={form.featured ? "fill" : "regular"} />
                      Featured
                    </span>
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(event) => updateForm("featured", event.target.checked)}
                      className="toggle toggle-warning toggle-sm"
                    />
                  </label>

                  {form.type === "event" ? (
                    <div className="grid gap-3 rounded-2xl border border-accent-purple/20 bg-accent-purple/10 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5">
                          <span className="text-sm text-white/70">เริ่มกิจกรรม</span>
                          <input
                            type="datetime-local"
                            value={form.eventStartAt}
                            onChange={(event) => updateForm("eventStartAt", event.target.value)}
                            className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-orange/70"
                          />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-sm text-white/70">จบกิจกรรม</span>
                          <input
                            type="datetime-local"
                            value={form.eventEndAt}
                            onChange={(event) => updateForm("eventEndAt", event.target.value)}
                            className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-orange/70"
                          />
                        </label>
                      </div>
                      <label className="grid gap-1.5">
                        <span className="text-sm text-white/70">สถานที่</span>
                        <input
                          value={form.location}
                          onChange={(event) => updateForm("location", event.target.value)}
                          maxLength={160}
                          className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-orange/70"
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-sm text-white/70">CTA Label</span>
                      <input
                        value={form.ctaLabel}
                        onChange={(event) => updateForm("ctaLabel", event.target.value)}
                        maxLength={40}
                        className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-orange/70"
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-sm text-white/70">CTA URL</span>
                      <input
                        value={form.ctaUrl}
                        onChange={(event) => updateForm("ctaUrl", event.target.value)}
                        className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-orange/70"
                      />
                    </label>
                  </div>

                  <label className="grid gap-1.5">
                    <span className="text-sm text-white/70">Body</span>
                    <textarea
                      value={form.body}
                      onChange={(event) => updateForm("body", event.target.value)}
                      maxLength={6000}
                      rows={4}
                      className="resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-primary-orange/70"
                    />
                  </label>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-orange px-3 py-2 text-sm font-semibold text-black transition hover:bg-primary-orange-glow disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FloppyDisk />
                    {isSaving ? "กำลังบันทึก" : "บันทึก"}
                  </button>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={!form.id || !isPublishable(form) || isPublishing}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/15 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <CheckCircle />
                    Publish
                  </button>
                  <button
                    type="button"
                    onClick={handleArchive}
                    disabled={!form.id || isArchiving}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/15 px-3 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-400/25 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Archive />
                    Archive
                  </button>
                </div>
              </div>
            </aside>
          </section>
        </main>
      </div>
    </>
  );
}
