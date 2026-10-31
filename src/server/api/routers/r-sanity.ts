import { competitionAdminApiClient } from "~/server/services/competition-admin-api-client";
import { readSourceExportDiagnostics } from "~/lib/competition-export-protocol";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { z } from "zod";
import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import { sanityClient } from "~/server/sanity";
import {
  createLegacyCompetitionExport,
  legacyExportError,
} from "~/server/services/legacy-competition-export.service";

const eventId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/);

export const sanityRouter = createTRPCRouter({
  // Get all available events from eventRegister documents (deprecated - use getEventsForExport)
  getAvailableEvents: protectProcedure.query(async () => {
    try {
      const query = `*[_type == "eventRegister"] {
        _id,
        "event": event->{title, _id},
        ownerName,
        microchip,
        birthday,
        "father": fatherName,
        "mother": motherName,
        createdAt,
        updatedAt
      } | order(createdAt desc)`;
      
      const result = await sanityClient.fetch(query);
      
      // Extract unique event names from event
      const eventNames = [...new Set(result.map((item: any) => item.event?.title).filter(Boolean))];
      
      return {
        success: true,
        events: eventNames,
        totalCount: result.length,
      };
    } catch (error) {
      console.error("Error fetching events from Sanity:", error);
      return {
        success: false,
        error: "Failed to fetch events from Sanity",
        events: [],
        totalCount: 0,
      };
    }
  }),

  // Get event data by event name for export (deprecated - use exportEventData)
  getEventData: protectProcedure
    .input(z.object({
      eventName: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        const query = `*[_type == "eventRegister" && event->title == $eventName] {
          _id,
          "event": event->{title, _id},
          ownerName,
          ownerTel,
          microchip,
          name,
          "father": fatherName,
          "mother": motherName,
          birthday,
          createdAt,
          updatedAt
        } | order(createdAt asc)`;
        
        const result = await sanityClient.fetch(query, { eventName: input.eventName });
        
        return {
          success: true,
          data: result,
          count: result.length,
        };
      } catch (error) {
        console.error("Error fetching event data from Sanity:", error);
        return {
          success: false,
          error: "Failed to fetch event data from Sanity",
          data: [],
          count: 0,
        };
      }
    }),

  // Get all event registers for admin overview
  getAllEventRegisters: protectProcedure
    .input(z.object({
      limit: z.number().optional().default(100),
      offset: z.number().optional().default(0),
    }))
    .query(async ({ input }) => {
      try {
        const query = `*[_type == "eventRegister"] {
          _id,
          "event": event->{title, _id},
          ownerName,
          ownerTel,
          microchip,
          name,
          "father": fatherName,
          "mother": motherName,
          birthday,
          createdAt,
          updatedAt
        } | order(createdAt desc) [${input.offset}...${input.offset + input.limit}]`;
        
        const result = await sanityClient.fetch(query);
        
        // Get total count
        const countQuery = `count(*[_type == "eventRegister"])`;
        const totalCount = await sanityClient.fetch(countQuery);
        
        return {
          success: true,
          data: result,
          count: result.length,
          totalCount: totalCount,
          hasMore: input.offset + input.limit < totalCount,
        };
      } catch (error) {
        console.error("Error fetching all event registers from Sanity:", error);
        return {
          success: false,
          error: "Failed to fetch event registers from Sanity",
          data: [],
          count: 0,
          totalCount: 0,
          hasMore: false,
        };
      }
    }),

  // All export entry points use the same source-owned event inventory, including drafts.
  getEventsForExport: protectProcedure.query(async () => {
    try {
      const events: Array<{ _id: string; title: string; _type: "event" }> = [];
      const ids = new Set<string>();
      let expectedTotal: number | null = null;
      const pageSize = 100;
      for (let page = 1; ; page++) {
        const result = await competitionAdminApiClient.list({
          search: "",
          page,
          pageSize,
        });
        if (
          !Number.isSafeInteger(result.total) ||
          result.total < 0 ||
          result.page !== page ||
          result.pageSize !== pageSize
        )
          throw new Error("Invalid source event pagination");
        if (expectedTotal === null) expectedTotal = result.total;
        if (
          result.total !== expectedTotal ||
          result.items.length !==
            Math.min(pageSize, Math.max(0, expectedTotal - events.length))
        )
          throw new Error("Source event inventory changed or is incomplete");
        for (const event of result.items) {
          if (ids.has(event._id)) throw new Error("Repeated source event page");
          ids.add(event._id);
          events.push({ _id: event._id, title: event.title, _type: "event" });
        }
        if (events.length === expectedTotal) break;
      }
      events.sort(
        (left, right) =>
          left.title.localeCompare(right.title, "th", { numeric: true }) ||
          (left._id < right._id ? -1 : left._id > right._id ? 1 : 0),
      );
      return { success: true, data: events };
    } catch (error) {
      console.error("Error fetching source events for export:", error);
      return {
        success: false,
        error: "โหลดรายการงานจากระบบการแข่งขันไม่สำเร็จหรือไม่ครบ กรุณาลองใหม่",
        data: [] as Array<{ _id: string; title: string; _type: "event" }>,
      };
    }
  }),

  // Keep the legacy download envelope; the source competition API owns the data and ages.
  exportEventData: protectProcedure
    .input(z.object({ eventId }))
    .mutation(async ({ input }) => {
      try {
        return {
          success: true,
          data: await createLegacyCompetitionExport(input.eventId, "xlsx"),
        };
      } catch (error) {
        return {
          success: false,
          error: legacyExportError(error),
          diagnostics: readSourceExportDiagnostics(error),
          data: null,
        };
      }
    }),
  exportEventDataToDocx: protectProcedure
    .input(z.object({ eventId }))
    .mutation(async ({ input }) => {
      try {
        return {
          success: true,
          data: await createLegacyCompetitionExport(input.eventId, "docx"),
        };
      } catch (error) {
        return {
          success: false,
          error: legacyExportError(error),
          diagnostics: readSourceExportDiagnostics(error),
          data: null,
        };
      }
    }),
});
