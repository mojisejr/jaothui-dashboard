/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { z } from "zod";
import { createTRPCRouter, protectProcedure } from "~/server/api/trpc";
import { sanityClient } from "~/server/sanity";
import { utils, write } from "xlsx";
import dayjs from "dayjs";
import archiver from "archiver";

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

// Compression utility function
const createCompressedExport = async (excelBuffer: Buffer, filename: string): Promise<{
  buffer: Buffer;
  filename: string;
  isCompressed: boolean;
}> => {
  const fileSizeMB = excelBuffer.length / (1024 * 1024);
  
  // Return original file if under 10MB
  if (fileSizeMB <= 10) {
    return {
      buffer: excelBuffer,
      filename: filename,
      isCompressed: false,
    };
  }

  // Create ZIP file for files larger than 10MB
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk) => {
      chunks.push(chunk);
    });

    archive.on('end', () => {
      const zipBuffer = Buffer.concat(chunks);
      const zipFilename = filename.replace('.xlsx', '.zip');
      
      resolve({
        buffer: zipBuffer,
        filename: zipFilename,
        isCompressed: true,
      });
    });

    archive.on('error', (error) => {
      reject(error);
    });

    archive.append(excelBuffer, { name: filename });
    void archive.finalize();
  });
};

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
        father,
        mother,
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
          father,
          mother,
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
          father,
          mother,
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
            father,
            mother,
            "event": event->{title}
          }`
        );

        
        console.log("Export query result:", { 
          eventId: input.eventId, 
          resultCount: eventData.length,
          sampleData: eventData.slice(0, 2) // Log first 2 results for debugging
        });

        if (eventData.length === 0) {
          return {
            success: false,
            error: "No event registration data found for this event. This could be due to: 1) Wrong event ID, 2) No registrations for this event, 3) Field name mismatch in schema.",
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
            พ่อ: item.father || "", // Father name from user input
            แม่: item.mother || "", // Mother name from user input
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

        // Apply compression if needed
        const exportResult = await createCompressedExport(excelBuffer, filename);

        return {
          success: true,
          data: {
            buffer: exportResult.buffer,
            filename: exportResult.filename,
            recordCount: exportData.length,
            isCompressed: exportResult.isCompressed,
            originalSize: excelBuffer.length,
            compressedSize: exportResult.isCompressed ? exportResult.buffer.length : excelBuffer.length,
          },
        };
      } catch (error) {
        console.error("Error exporting event data:", {
          error: error,
          eventId: input.eventId,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined
        });
        return {
          success: false,
          error: `Failed to export event data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          data: null,
        };
      }
    }),
});
