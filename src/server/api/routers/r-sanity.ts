/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { z } from "zod";
import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import { sanityClient, EventRegister } from "~/server/sanity";
import { utils, write } from "xlsx";
import dayjs from "dayjs";

export interface ExportRowData {
  ลำดับ: number;
  เลขไมโครชิพ: string;
  ชื่อควาย: string;
  "วัน/เดือน/ปีเกิด": string;
  "อายุ (เดือน)": number;
  พ่อ: string;
  แม่: string;
  ชื่อฟาร์ม: string;
  เบอร์โทรศัพท์: string;
}

export interface SanityEvent {
  _id: string;
  title: string;
  _type: string;
}

export interface EventRegisterData {
  ownerName: string;
  ownerTel: string;
  microchip: string;
  name: string;
  color: string;
  sex: string;
  buffaloAge: number;
  type: string;
  level: string;
  birthday: string;
  event: {
    title: string;
  };
}

export const sanityRouter = createTRPCRouter({
  // Get all available events from eventRegister documents
  getAvailableEvents: protectProcedure.query(async () => {
    try {
      const query = `*[_type == "eventRegister"] {
        _id,
        eventName,
        buffaloName,
        microchip,
        birthday,
        father,
        mother,
        farmName,
        phoneNumber,
        createdAt,
        updatedAt
      } | order(createdAt desc)`;
      
      const result = await sanityClient.fetch(query);
      
      // Extract unique event names
      const eventNames = [...new Set(result.map((item: EventRegister) => item.eventName).filter(Boolean))];
      
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

  // Get event data by event name for export
  getEventData: protectProcedure
    .input(z.object({
      eventName: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        const query = `*[_type == "eventRegister" && eventName == $eventName] {
          _id,
          eventName,
          buffaloName,
          microchip,
          birthday,
          father,
          mother,
          farmName,
          phoneNumber,
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
          eventName,
          buffaloName,
          microchip,
          birthday,
          father,
          mother,
          farmName,
          phoneNumber,
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

  // Get events for export dropdown (using actual event documents)
  getEventsForExport: protectProcedure.query(async () => {
    try {
      const events = await sanityClient.fetch(
        `*[_type == "event"]{
          _id,
          title,
          _type
        } | order(title asc)`
      );
      return {
        success: true,
        data: events,
      };
    } catch (error) {
      console.error("Error fetching events for export:", error);
      return {
        success: false,
        error: "Failed to fetch events from Sanity CMS",
        data: [],
      };
    }
  }),

  // Export event data to Excel
  exportEventData: protectProcedure
    .input(z.object({
      eventId: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        // Query eventRegister data with event reference
        const eventData = await sanityClient.fetch(
          `*[_type == "eventRegister" && event._ref == "${input.eventId}"]{
            ownerName,
            ownerTel,
            microchip,
            name,
            color,
            sex,
            buffaloAge, 
            type,
            level,
            birthday,
            "event": event->{title}
          }`
        );
        
        if (eventData.length === 0) {
          return {
            success: false,
            error: "No event registration data found for this event",
            data: null,
          };
        }

        // Transform data to Issue #23 format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const exportData: ExportRowData[] = eventData.map((item: any, index: number) => {
          // Calculate age in months from birthday
          let ageInMonths = item.buffaloAge || 0;
          if (item.birthday) {
            const birthDate = dayjs(item.birthday);
            const currentDate = dayjs();
            ageInMonths = currentDate.diff(birthDate, 'months');
          }

          return {
            ลำดับ: index + 1,
            เลขไมโครชิพ: item.microchip || "",
            ชื่อควาย: item.name || "",
            "วัน/เดือน/ปีเกิด": item.birthday ? dayjs(item.birthday).format("DD/MM/YYYY") : "",
            "อายุ (เดือน)": ageInMonths,
            พ่อ: "", // Father name not available in eventRegister schema
            แม่: "", // Mother name not available in eventRegister schema
            ชื่อฟาร์ม: item.ownerName || "",
            เบอร์โทรศัพท์: item.ownerTel || "",
          };
        });

        // Create Excel file
        const ws = utils.json_to_sheet(exportData);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Event Registration Data");

        // Generate filename with event name and timestamp
        const eventName = eventData[0]?.event?.title || "event";
        const timestamp = dayjs().format("YYYY-MM-DD_HH-mm-ss");
        const filename = `${eventName}_${timestamp}.xlsx`;

        // Convert to buffer for download
        const excelBuffer = write(wb, { type: 'buffer', bookType: 'xlsx' });

        return {
          success: true,
          data: {
            buffer: excelBuffer,
            filename: filename,
            recordCount: exportData.length,
          },
        };
      } catch (error) {
        console.error("Error exporting event data:", error);
        return {
          success: false,
          error: "Failed to export event data",
          data: null,
        };
      }
    }),
});
