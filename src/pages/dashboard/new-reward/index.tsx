import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BaseLayout from "~/components/layout/BaseLayout";
import { api, type RouterOutputs } from "~/utils/api";
import { supabase } from "~/server/services/supabase/supabase";
import { rewardAssetKey } from "~/lib/reward-contract";
import { FeedbackPanel } from "~/components/buffalo-feedback/FeedbackPanel";
import {
  completedRefreshFeedback,
  feedbackFor,
  isUnauthorized,
  localFeedback,
  validateImage,
  type Feedback,
} from "~/components/buffalo-feedback/feedback";

import {
  parsePendingReward,
  type PendingReward as Pending,
} from "~/components/buffalo-feedback/reward-pending";
type Saved = NonNullable<RouterOutputs["reward"]["getById"]>;
const storageKey = "buffalo-reward-pending-v1";
async function digest(file: Blob) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
function sameReward(record: Saved, pending: Pending) {
  const input = pending.input;
  return (
    record.id === input.id &&
    record.microchip === input.microchip &&
    record.rewardName.trim() === input.rewardName &&
    record.eventName.trim() === input.eventName &&
    record.rewardImage === input.rewardImage &&
    (record.eventDate === null
      ? input.eventDate === null
      : input.eventDate !== null &&
        new Date(record.eventDate).toISOString().slice(0, 10) ===
          input.eventDate.slice(0, 10))
  );
}
export default function NewRewardPage() {
  const [searchValue, setSearchValue] = useState(""),
    [microchip, setMicrochip] = useState("");
  const [eventName, setEventName] = useState(""),
    [rewardName, setRewardName] = useState(""),
    [eventDate, setEventDate] = useState("");
  const [formGeneration, setFormGeneration] = useState(0);
  const [file, setFile] = useState<File | null>(null),
    [pending, setPending] = useState<Pending | null>(null),
    [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<Feedback | null>(null),
    [authLost, setAuthLost] = useState(false);
  const [pendingInvalid, setPendingInvalid] = useState(false);
  const recovered = useRef(false);
  const lock = useRef(false),
    pendingRef = useRef<Pending | null>(null);
  const utils = api.useUtils();
  const query = api.ped.searchByMicrochip.useQuery(microchip, {
    enabled: !!microchip && !authLost,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const save = api.reward.addNewReward.useMutation();
  function remember(next: Pending) {
    pendingRef.current = next;
    setPending(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const value = parsePendingReward(
        raw,
        (path) =>
          supabase.storage.from("slipstorage").getPublicUrl(path).data
            .publicUrl,
      );
      recovered.current = true;
      pendingRef.current = value;
      setPending(value);
      setMicrochip(value.input.microchip);
      setSearchValue(value.input.microchip);
      setEventName(value.input.eventName);
      setRewardName(value.input.rewardName);
      setEventDate(value.input.eventDate?.slice(0, 10) ?? "");
      setError(localFeedback("REWARD_RESULT_UNCONFIRMED", value.input.id));
    } catch {
      setPendingInvalid(true);
      setError(localFeedback("PENDING_REWARD_INVALID"));
    }
  }, []);
  useEffect(() => {
    if (isUnauthorized(query.error)) setAuthLost(true);
  }, [query.error]);
  async function accept(record: Saved, attempt: Pending) {
    if (!sameReward(record, attempt))
      throw localFeedback("REWARD_RESULT_UNCONFIRMED", attempt.input.id);
    setSaved(record);
    setError(null);
    try {
      const fresh = await utils.ped.searchByMicrochip.fetch(
        attempt.input.microchip,
      );
      if (!fresh) throw Error("REFRESH_FAILED");
      utils.ped.searchByMicrochip.setData(attempt.input.microchip, fresh);
    } catch (cause) {
      setError(completedRefreshFeedback(cause, attempt.input.id));
    }
  }
  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (lock.current || authLost || !!saved || pendingInvalid) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      let attempt = pendingRef.current;
      if (!attempt) {
        if (
          !query.data?.microchip ||
          !file ||
          !eventName.trim() ||
          !rewardName.trim() ||
          (eventDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate))
        )
          throw localFeedback("INPUT_INVALID");
        const invalid = validateImage(file);
        if (invalid) throw invalid;
        const calendar = eventDate
          ? new Date(`${eventDate}T00:00:00.000Z`)
          : null;
        if (
          calendar &&
          (!Number.isFinite(calendar.getTime()) ||
            calendar.toISOString().slice(0, 10) !== eventDate ||
            calendar.getUTCFullYear() < 1900)
        )
          throw localFeedback("INPUT_INVALID");
        const id = crypto.randomUUID(),
          hash = await digest(file),
          path = rewardAssetKey(
            id,
            hash,
            file.type === "image/png" ? "png" : "jpg",
          );
        const url = supabase.storage.from("slipstorage").getPublicUrl(path)
          .data.publicUrl;
        attempt = {
          input: {
            id,
            microchip: query.data.microchip,
            eventName: eventName.trim(),
            rewardName: rewardName.trim(),
            eventDate: calendar?.toISOString() ?? null,
            rewardImage: url,
          },
          path,
          digest: hash,
          uploaded: false,
        };
        remember(attempt);
      } else {
        // Reconcile the same stable key before any repeated upload or mutation.
        const existing = await utils.reward.getById.fetch({
          id: attempt.input.id,
        });
        if (existing) {
          await accept(existing, attempt);
          return;
        }
      }
      if (recovered.current && attempt.uploaded) {
        const existingAsset = await supabase.storage
          .from("slipstorage")
          .download(attempt.path);
        if (
          !!existingAsset.error ||
          !existingAsset.data ||
          (await digest(existingAsset.data)) !== attempt.digest
        )
          throw localFeedback("REWARD_UPLOAD_UNCONFIRMED", attempt.input.id);
        recovered.current = false;
      }
      if (!attempt.uploaded) {
        if (!file || (await digest(file)) !== attempt.digest)
          throw localFeedback("REWARD_UPLOAD_UNCONFIRMED", attempt.input.id);
        const upload = await supabase.storage
          .from("slipstorage")
          .upload(attempt.path, file, {
            cacheControl: "0",
            upsert: false,
            contentType: file.type,
          });
        if (upload.error) {
          // Existing object after a lost response is trusted only after content verification.
          const existing = await supabase.storage
            .from("slipstorage")
            .download(attempt.path);
          if (
            !!existing.error ||
            !existing.data ||
            (await digest(existing.data)) !== attempt.digest
          )
            throw localFeedback("REWARD_UPLOAD_UNCONFIRMED", attempt.input.id);
        }
        attempt = { ...attempt, uploaded: true };
        remember(attempt);
      }
      const record = await save.mutateAsync({
        ...attempt.input,
        eventDate: attempt.input.eventDate
          ? new Date(attempt.input.eventDate)
          : null,
      });
      if (!record)
        throw localFeedback("REWARD_RESULT_UNCONFIRMED", attempt.input.id);
      await accept(record, attempt);
    } catch (cause) {
      if (isUnauthorized(cause)) setAuthLost(true);
      setError(
        feedbackFor(cause, {
          operationId: pendingRef.current?.input.id,
          stage: pendingRef.current?.uploaded
            ? "database_write"
            : "asset_upload",
        }),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function nextReward() {
    if (!saved) return;
    localStorage.removeItem(storageKey);
    pendingRef.current = null;
    setPending(null);
    setSaved(null);
    setError(null);
    setFile(null);
    setFormGeneration((generation) => generation + 1);
    setEventName("");
    setRewardName("");
    setEventDate("");
  }
  const locked = busy || authLost || !!pending || !!saved || pendingInvalid;
  return (
    <BaseLayout title="ระบบเพิ่มข้อมูลรางวัล">
      <main className="mx-auto w-full min-w-0 max-w-3xl space-y-6 p-4 text-base sm:p-6">
        <form
          className="grid gap-3 rounded-lg border border-primary p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            const value = searchValue.trim();
            setMicrochip(value);
            if (value === microchip) void query.refetch();
          }}
        >
          <label htmlFor="reward-search">ค้นหาควายด้วย microchip</label>
          <input
            id="reward-search"
            className="input input-bordered input-primary min-h-12 w-full"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            required
            disabled={locked}
          />
          <button
            className="btn btn-primary min-h-12"
            disabled={locked || query.isFetching}
          >
            ค้นหา
          </button>
        </form>
        {!microchip && (
          <p role="status">กรอก microchip เพื่อค้นหาทะเบียนก่อนเพิ่มรางวัล</p>
        )}
        {microchip && query.isFetching && (
          <p role="status">กำลังค้นหาข้อมูลทะเบียน…</p>
        )}
        {query.isSuccess && query.data === null && (
          <p role="status">
            ไม่พบควายสำหรับ microchip {microchip} กรุณาตรวจเลขแล้วค้นหาอีกครั้ง
          </p>
        )}
        {query.error && (
          <FeedbackPanel
            title="โหลดทะเบียนไม่สำเร็จ"
            feedback={
              saved
                ? completedRefreshFeedback(query.error, saved.id)
                : feedbackFor(query.error, { outcome: "not_started" })
            }
            onRetry={() => {
              if (saved && pendingRef.current)
                void accept(saved, pendingRef.current).catch((cause: unknown) =>
                  setError(completedRefreshFeedback(cause, saved.id)),
                );
              else void query.refetch();
            }}
            retryLabel="โหลดทะเบียนอีกครั้ง"
            busy={busy || authLost || query.isFetching}
          />
        )}
        {query.data && query.error && (
          <p role="status">
            แสดงข้อมูลที่เคยโหลดไว้ ยังยืนยันทะเบียนล่าสุดไม่ได้
          </p>
        )}
        {authLost && (
          <Link href="/" className="btn btn-primary min-h-12">
            เข้าสู่ระบบอีกครั้ง
          </Link>
        )}
        {error &&
          !(
            saved &&
            query.error &&
            error.code === "COMPLETED_REFRESH_FAILED"
          ) && (
            <FeedbackPanel
              feedback={error}
              onRetry={
                saved
                  ? () => {
                      void accept(saved, pendingRef.current!).catch(
                        (cause: unknown) =>
                          setError(completedRefreshFeedback(cause, saved.id)),
                      );
                    }
                  : undefined
              }
              retryLabel="โหลดรายละเอียดอีกครั้ง"
              busy={busy || authLost}
            />
          )}
        {(!!query.data || !!pending) && (
          <section className="space-y-4 rounded-lg border border-primary p-4">
            <h1 className="text-xl font-semibold">ข้อมูลรางวัล</h1>
            <p className="break-all">
              ชื่อ: {query.data?.name ?? "กำลังตรวจข้อมูลรายการเดิม"} ·
              microchip {pending?.input.microchip ?? query.data?.microchip}
            </p>
            {pending && (
              <p className="break-all text-sm">
                เลขรายการรางวัล: {pending.input.id} ·
                {saved
                  ? "ยืนยันการบันทึกรายการนี้แล้ว"
                  : "เก็บข้อมูลเดิมไว้จนยืนยันการบันทึก"}
              </p>
            )}
            <form
              className="grid gap-4"
              onSubmit={(event) => void submit(event)}
            >
              <label htmlFor="reward-file">
                ภาพตอนรับรางวัล
                <span className="block text-sm">
                  JPEG / PNG ขนาดต่ำกว่า 2,000,000 ไบต์ (2 MB)
                  {pending && !pending.uploaded
                    ? " · หากกลับเข้าหน้านี้ ให้เลือกไฟล์เดิม"
                    : ""}
                </span>
                <input
                  key={formGeneration}
                  id="reward-file"
                  type="file"
                  accept="image/jpeg,image/png"
                  className="file-input file-input-bordered file-input-primary mt-1 min-h-12 w-full"
                  disabled={busy || authLost || !!saved || !!pending?.uploaded}
                  required={!pending}
                  onChange={(event) => {
                    const chosen = event.target.files?.[0] ?? null;
                    setFile(chosen);
                    setError(chosen ? validateImage(chosen) : null);
                  }}
                />
              </label>
              <label htmlFor="reward-event">
                ชื่องาน
                <input
                  id="reward-event"
                  className="input input-bordered input-primary mt-1 min-h-12 w-full"
                  value={eventName}
                  onChange={(event) => setEventName(event.target.value)}
                  disabled={locked}
                  required
                  maxLength={300}
                />
              </label>
              <label htmlFor="reward-name">
                รางวัล
                <input
                  id="reward-name"
                  className="input input-bordered input-primary mt-1 min-h-12 w-full"
                  value={rewardName}
                  onChange={(event) => setRewardName(event.target.value)}
                  disabled={locked}
                  required
                  maxLength={300}
                />
              </label>
              <label htmlFor="reward-date">
                วันที่ได้รับรางวัล (ไม่บังคับ)
                <input
                  id="reward-date"
                  type="date"
                  min="1900-01-01"
                  className="input input-bordered input-primary mt-1 min-h-12 w-full"
                  value={eventDate}
                  onChange={(event) => setEventDate(event.target.value)}
                  disabled={locked}
                />
              </label>
              {!saved && (
                <button
                  className="btn btn-primary min-h-12"
                  disabled={
                    busy ||
                    authLost ||
                    pendingInvalid ||
                    (!pending && (!!query.error || query.isFetching)) ||
                    (!!file && !!validateImage(file))
                  }
                >
                  {busy
                    ? "กำลังตรวจสอบและบันทึก…"
                    : pending
                      ? "ตรวจสอบและดำเนินการรายการเดิม"
                      : "บันทึกรางวัล"}
                </button>
              )}
            </form>
            {saved && (
              <div role="status" className="space-y-3">
                <p>บันทึกรางวัลสำเร็จแล้ว: {saved.rewardName}</p>
                <p className="break-all text-sm">เลขรายการ {saved.id}</p>
                <button
                  className="btn btn-primary min-h-12"
                  disabled={busy || authLost}
                  onClick={nextReward}
                >
                  เพิ่มรางวัลถัดไป
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </BaseLayout>
  );
}
