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
  father: string;
  mother: string;
  event: {
    title: string;
  };
}

// Task 1: Age range parsing function
const parseAgeRange = (typeString: string): string => {
  // Parse "มากกว่า X เดือน ถึง Y เดือน" → X-Y
  const rangeMatch1 = typeString.match(/มากกว่า\s*(\d+)\s*เดือน\s*ถึง\s*(\d+)\s*เดือน/);
  if (rangeMatch1) {
    return `${rangeMatch1[1]}-${rangeMatch1[2]}`;
  }

  // Parse "X เดือน ถึง Y เดือน" → X-Y
  const rangeMatch2 = typeString.match(/(\d+)\s*เดือน\s*ถึง\s*(\d+)\s*เดือน/);
  if (rangeMatch2) {
    return `${rangeMatch2[1]}-${rangeMatch2[2]}`;
  }

  // Parse "ไม่เกิน X เดือน" → 0-X
  const maxMatch = typeString.match(/ไม่เกิน\s*(\d+)\s*เดือน/);
  if (maxMatch) {
    return `0-${maxMatch[1]}`;
  }

  // Parse "มากกว่า X เดือน" → X-999
  const minMatch = typeString.match(/มากกว่า\s*(\d+)\s*เดือน/);
  if (minMatch) {
    return `${minMatch[1]}-999`;
  }

  // Default fallback
  return "unknown";
};

// Task 2: Data grouping algorithm
interface GroupedData {
  type: string;
  ageRange: string;
  color: string;
  sex: string;
  buffaloes: EventRegisterData[];
}

const groupEventData = (eventData: EventRegisterData[]): GroupedData[] => {
  const groups = new Map<string, GroupedData>();

  eventData.forEach((item) => {
    const type = item.type || "ไม่ระบุประเภท";
    const ageRange = parseAgeRange(type);
    const color = item.color || "ไม่ระบุสี";
    const sex = item.sex || "ไม่ระบุเพศ";
    
    // Create unique key for Type-Color-Sex combination
    const key = `${type}|||${color}|||${sex}`;
    
    if (!groups.has(key)) {
      groups.set(key, {
        type,
        ageRange,
        color,
        sex,
        buffaloes: [],
      });
    }
    
    groups.get(key)!.buffaloes.push(item);
  });

  // Convert to array and sort by type importance
  return Array.from(groups.values());
};

// Task 3: Hierarchical sheet creation function
const createHierarchicalSheet = (group: GroupedData) => {
  const sheetData: any[] = [];
  
  // Row 1: Competition Type (merged A1:I1)
  sheetData.push([`ประเภทการแข่งขัน: ${group.type}`, '', '', '', '', '', '', '', '']);
  
  // Row 2: Buffalo Color (merged A2:I2)
  sheetData.push([`สีควาย: ${group.color}`, '', '', '', '', '', '', '', '']);
  
  // Row 3: Sex (merged A3:I3)
  sheetData.push([`เพศ: ${group.sex}`, '', '', '', '', '', '', '', '']);
  
  // Row 4: Data headers
  sheetData.push([
    'ลำดับ',
    'เลขไมโครชิพ',
    'ชื่อควาย',
    'วัน/เดือน/ปีเกิด',
    'อายุ (เดือน)',
    'พ่อ',
    'แม่',
    'ชื่อฟาร์ม',
    'เบอร์โทรศัพท์'
  ]);
  
  // Row 5+: Buffalo data or "ไม่มีข้อมูล"
  if (group.buffaloes.length === 0) {
    sheetData.push(['ไม่มีข้อมูล', '', '', '', '', '', '', '', '']);
  } else {
    group.buffaloes.forEach((buffalo, index) => {
      // Calculate age in months from birthday
      let ageInMonths = buffalo.buffaloAge || 0;
      if (buffalo.birthday) {
        const birthDate = dayjs(buffalo.birthday);
        const currentDate = dayjs();
        ageInMonths = currentDate.diff(birthDate, 'months');
      }
      
      sheetData.push([
        index + 1,
        buffalo.microchip || '',
        buffalo.name || '',
        buffalo.birthday ? dayjs(buffalo.birthday).format('DD/MM/YYYY') : '',
        ageInMonths,
        buffalo.father || '',
        buffalo.mother || '',
        buffalo.ownerName || '',
        buffalo.ownerTel || ''
      ]);
    });
  }
  
  // Create worksheet
  const ws = utils.aoa_to_sheet(sheetData);
  
  // Apply cell merging for hierarchical headers
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, // Row 1 (Type)
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }, // Row 2 (Color)
    { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } }, // Row 3 (Sex)
  ];
  
  // Apply bold formatting to headers (rows 1-4)
  // Note: XLSX library has limited styling support
  // More advanced styling would require xlsx-style or similar
  
  return ws;
};

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

        // Task 4 & 5: Multi-sheet Excel generation
        // Group data by Type-Color-Sex combinations
        const groupedData = groupEventData(eventData);
        
        // Create workbook
        const wb = utils.book_new();
        
        // Create one sheet per group
        groupedData.forEach((group) => {
          // Generate Thai-only sheet name: [Type]-[AgeRange]-[Color]-[Sex]
          // Sanitize sheet name (Excel limits sheet names to 31 characters)
          let sheetName = `${group.type}-${group.ageRange}-${group.color}-${group.sex}`;
          
          // Truncate if too long (Excel max is 31 chars)
          if (sheetName.length > 31) {
            sheetName = sheetName.substring(0, 31);
          }
          
          // Create hierarchical sheet
          const ws = createHierarchicalSheet(group);
          
          // Add sheet to workbook
          utils.book_append_sheet(wb, ws, sheetName);
        });

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
            buffer: exportResult.buffer.toString('base64'),
            filename: exportResult.filename,
            recordCount: eventData.length,
            sheetCount: groupedData.length,
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
