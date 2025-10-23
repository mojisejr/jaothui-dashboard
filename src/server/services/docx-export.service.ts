/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  VerticalAlign,
} from "docx";
import archiver from "archiver";
import dayjs from "dayjs";

/**
 * Interface for event registration data used in DOCX export
 */
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

/**
 * Thai language field mapping utilities
 */
const thaiFieldMapping = {
  color: {
    black: "ดำ",
    white: "ขาว",
    gray: "เทา",
    brown: "น้ำตาล",
    albino: "อัลไบโน",
  },
  sex: {
    male: "ผู้",
    female: "เมีย",
  },
};

/**
 * Map English color values to Thai
 */
const mapColorToThai = (color: string): string => {
  const lowerColor = color.toLowerCase();
  return thaiFieldMapping.color[lowerColor as keyof typeof thaiFieldMapping.color] ?? color;
};

/**
 * Map English sex values to Thai
 */
const mapSexToThai = (sex: string): string => {
  const lowerSex = sex.toLowerCase();
  return thaiFieldMapping.sex[lowerSex as keyof typeof thaiFieldMapping.sex] ?? sex;
};

/**
 * Calculate age in months from birthday
 */
const calculateAgeInMonths = (birthday: string, buffaloAge?: number): number => {
  if (birthday) {
    const birthDate = dayjs(birthday);
    const currentDate = dayjs();
    return currentDate.diff(birthDate, "months");
  }
  return buffaloAge ?? 0;
};

/**
 * Create a table cell with specified content and styling
 */
const createTableCell = (
  content: string,
  options: {
    bold?: boolean;
    alignment?: typeof AlignmentType[keyof typeof AlignmentType];
    verticalAlign?: typeof VerticalAlign[keyof typeof VerticalAlign];
    columnSpan?: number;
  } = {}
): TableCell => {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: content,
            bold: options.bold,
            font: "TH Sarabun New",
            size: 28, // 14pt
          }),
        ],
        alignment: options.alignment ?? AlignmentType.LEFT,
      }),
    ],
    verticalAlign: options.verticalAlign ?? VerticalAlign.CENTER,
    columnSpan: options.columnSpan,
  });
};

/**
 * Generate individual DOCX registration form for a buffalo
 */
export const generateBuffaloRegistrationDoc = async (
  data: EventRegisterData,
  index: number
): Promise<Buffer> => {
  // Map fields to Thai
  const colorThai = mapColorToThai(data.color);
  const sexThai = mapSexToThai(data.sex);
  const ageInMonths = calculateAgeInMonths(data.birthday, data.buffaloAge);
  const birthdayFormatted = data.birthday
    ? dayjs(data.birthday).format("DD/MM/YYYY")
    : "-";

  // Create document header
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Title
          new Paragraph({
            children: [
              new TextRun({
                text: "ใบสมัครลงทะเบียนควาย",
                bold: true,
                font: "TH Sarabun New",
                size: 36, // 18pt
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),

          // Event title
          new Paragraph({
            children: [
              new TextRun({
                text: `งาน: ${data.event.title}`,
                bold: true,
                font: "TH Sarabun New",
                size: 32, // 16pt
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // Registration number
          new Paragraph({
            children: [
              new TextRun({
                text: `เลขที่: ${index + 1}`,
                font: "TH Sarabun New",
                size: 28,
              }),
            ],
            spacing: { after: 200 },
          }),

          // Registration table
          new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1 },
              bottom: { style: BorderStyle.SINGLE, size: 1 },
              left: { style: BorderStyle.SINGLE, size: 1 },
              right: { style: BorderStyle.SINGLE, size: 1 },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
              insideVertical: { style: BorderStyle.SINGLE, size: 1 },
            },
            rows: [
              // Competition type header
              new TableRow({
                children: [
                  createTableCell("ประเภทการแข่งขัน", {
                    bold: true,
                    columnSpan: 2,
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
              // Competition type value
              new TableRow({
                children: [
                  createTableCell("ประเภท", { bold: true }),
                  createTableCell(data.type || "-"),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("ระดับ", { bold: true }),
                  createTableCell(data.level || "-"),
                ],
              }),

              // Buffalo information header
              new TableRow({
                children: [
                  createTableCell("ข้อมูลควาย", {
                    bold: true,
                    columnSpan: 2,
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("เลขไมโครชิพ", { bold: true }),
                  createTableCell(data.microchip || "-"),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("ชื่อควาย", { bold: true }),
                  createTableCell(data.name || "-"),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("สี", { bold: true }),
                  createTableCell(colorThai),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("เพศ", { bold: true }),
                  createTableCell(sexThai),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("วัน/เดือน/ปีเกิด", { bold: true }),
                  createTableCell(birthdayFormatted),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("อายุ (เดือน)", { bold: true }),
                  createTableCell(ageInMonths.toString()),
                ],
              }),

              // Pedigree information header
              new TableRow({
                children: [
                  createTableCell("ข้อมูลพ่อแม่พันธุ์", {
                    bold: true,
                    columnSpan: 2,
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("พ่อ", { bold: true }),
                  createTableCell(data.father || "-"),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("แม่", { bold: true }),
                  createTableCell(data.mother || "-"),
                ],
              }),

              // Owner information header
              new TableRow({
                children: [
                  createTableCell("ข้อมูลเจ้าของ", {
                    bold: true,
                    columnSpan: 2,
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("ชื่อฟาร์ม/เจ้าของ", { bold: true }),
                  createTableCell(data.ownerName || "-"),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("เบอร์โทรศัพท์", { bold: true }),
                  createTableCell(data.ownerTel || "-"),
                ],
              }),
            ],
          }),

          // Footer spacing
          new Paragraph({
            text: "",
            spacing: { after: 400 },
          }),
        ],
      },
    ],
  });

  // Generate buffer
  const buffer = await Packer.toBuffer(doc);
  return buffer;
};

/**
 * Generate ZIP bundle containing all buffalo registration DOCX files
 * Optimized for large datasets to avoid timeouts
 */
export const generateDocxZipBundle = async (
  eventData: EventRegisterData[]
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    // Use faster compression for better performance
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk) => {
      chunks.push(chunk);
    });

    archive.on("end", () => {
      const zipBuffer = Buffer.concat(chunks);
      resolve(zipBuffer);
    });

    archive.on("error", (error) => {
      reject(error);
    });

    // Process batches asynchronously
    const processBatches = async () => {
      try {
        // Process in batches to avoid memory issues and timeout
        const batchSize = 50;
        for (let i = 0; i < eventData.length; i += batchSize) {
          const batch = eventData.slice(i, i + batchSize);
          
          // Generate DOCX files for this batch in parallel
          const batchPromises = batch.map(async (buffalo, batchIndex) => {
            const index = i + batchIndex;
            const docxBuffer = await generateBuffaloRegistrationDoc(buffalo, index);
            const filename = `${index + 1}_${buffalo.name ?? buffalo.microchip ?? "unknown"}.docx`;
            return { buffer: docxBuffer, filename };
          });

          const batchResults = await Promise.all(batchPromises);
          
          // Append all files from this batch to archive
          for (const { buffer, filename } of batchResults) {
            archive.append(buffer, { name: filename });
          }
        }

        // Finalize archive after all files are appended
        await archive.finalize();
      } catch (error) {
        reject(error);
      }
    };

    // Start processing
    void processBatches();
  });
};
