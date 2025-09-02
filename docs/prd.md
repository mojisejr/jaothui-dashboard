### Product Requirements Document (PRD) สำหรับระบบ Jaothui Dashboard

---

### 1. บทสรุปโครงการ (Project Summary)

Jaothui Dashboard เป็นระบบหลังบ้านที่พัฒนาขึ้นสำหรับผู้ดูแลระบบ เพื่อใช้ในการจัดการข้อมูลควาย ซึ่งเป็นส่วนหนึ่งของแพลตฟอร์ม jaothui.com ระบบนี้มีหน้าที่หลักในการเชื่อมต่อข้อมูลระหว่างฐานข้อมูลส่วนกลางกับ **ระบบ Blockchain บนเครือข่าย Bitkub Chain** เพื่อสร้างและบริหารจัดการข้อมูล NFT ที่เป็นตัวแทนของควายแต่ละตัว การจัดการข้อมูลนี้ครอบคลุมตั้งแต่การสร้างข้อมูลควายใหม่ การแก้ไขข้อมูลที่มีอยู่ และการจัดการข้อมูลที่เกี่ยวข้องอื่นๆ เช่น การออกใบรับรองและการบันทึกรางวัล

---

### 2. กลุ่มเป้าหมาย (Target Audience)

- **ผู้ใช้งานหลัก:** ผู้ดูแลระบบ (Admin) ของ jaothui.com ซึ่งมีสิทธิ์ในการเข้าถึงและจัดการข้อมูลควายทั้งหมด
- **ผู้ที่เกี่ยวข้อง:**
  - **Project Manager คนใหม่:** เพื่อทำความเข้าใจภาพรวมและรายละเอียดของโครงการได้อย่างรวดเร็ว
  - **Developer คนใหม่:** เพื่อทำความเข้าใจสถาปัตยกรรม เทคโนโลยี และแบบแผนการเขียนโค้ด เพื่อให้สามารถพัฒนาต่อยอดและแก้ไขปัญหาได้อย่างมีประสิทธิภาพ

---

### 3. ขอบเขตและคุณสมบัติหลัก (Scope & Core Features)

ระบบนี้ครอบคลุมการทำงานหลักดังต่อไปนี้:

- **การจัดการข้อมูลควาย (Buffalo Data Management)**
  - **การสร้างควายใหม่ (New Buffalo Info):** ผู้ดูแลระบบสามารถเพิ่มข้อมูลควายใหม่เข้าสู่ระบบได้ กระบวนการนี้ประกอบด้วย:
    1.  การกรอกข้อมูลพื้นฐานของควาย (ชื่อ, ไมโครชิป, วันเกิด, เพศ, สี, ส่วนสูง, รายละเอียด และพ่อแม่)
    2.  การอัปโหลดรูปภาพควายไปยัง Supabase Storage
    3.  การสร้างและ Mint NFT สำหรับควายตัวนั้นบน Bitkub Chain
  - **การแก้ไขข้อมูลควาย (Update Buffalo Info):** ผู้ดูแลระบบสามารถค้นหาและแก้ไขข้อมูลควายที่มีอยู่แล้วได้ โดยการค้นหาจะใช้ Microchip เป็นหลัก ข้อมูลที่แก้ไขได้ประกอบด้วย ชื่อ, หมายเลขใบรับรอง, วันเกิด, สี, รายละเอียด, DNA, ส่วนสูง, รูปภาพ, ไมโครชิป, แหล่งกำเนิด, พ่อแม่ และระดับความหายาก (Rarity)
    - **หมายเหตุ:** การแก้ไขข้อมูลบางอย่างจะส่งผลให้มีการอัปเดตข้อมูลบน Blockchain ด้วย
- **การจัดการข้อมูลอื่นๆ (Other Related Management)**
  - **การจัดการใบรับรอง (Certificate Management):** ระบบมีส่วนสำหรับจัดการการอนุมัติใบรับรอง
  - **การจัดการรางวัล (Reward Management):** สามารถเพิ่มข้อมูลรางวัลสำหรับควายได้
  - **การจัดการไมโครชิป (Microchip Management):** มีส่วนที่เกี่ยวข้องกับการสั่งซื้อและสถานะของไมโครชิป
  - **การจัดการการชำระเงิน (Payment Management):** มีโมเดลสำหรับจัดการการชำระเงินในระบบ
  - **การจัดการฟาร์ม (Farm Management):** มีการจัดการข้อมูลของฟาร์ม
  - **การจัดการผู้ใช้งาน (User Management):** มีโมเดลสำหรับจัดการข้อมูลผู้ใช้งานและบทบาท (`USER` / `ADMIN`)
- **การเข้าสู่ระบบ (Authentication):** ระบบมีหน้าจอสำหรับผู้ดูแลระบบเข้าสู่ระบบเพื่อใช้งาน Dashboard

---

### 4. สถาปัตยกรรมและเทคโนโลยี (Architecture & Technology Stack)

ระบบนี้สร้างขึ้นโดยใช้ **T3 Stack** ซึ่งเป็นสถาปัตยกรรมที่เน้นความเรียบง่ายและ Type-safety:

- **Frontend/Framework:** **Next.js** ใช้สำหรับการสร้างหน้าจอผู้ใช้งานและจัดการ Routing
- **API Layer:** **tRPC** ใช้เป็น Type-safe API layer ที่ทำให้การเรียกใช้งาน API จาก Frontend เป็นไปอย่างราบรื่นและปลอดภัย
- **Database & ORM:** **Prisma** เป็น Object-Relational Mapper (ORM) ที่ใช้เชื่อมต่อกับฐานข้อมูล **PostgreSQL**
- **Styling:** **Tailwind CSS** และ **DaisyUI** ใช้สำหรับการออกแบบและจัดรูปแบบส่วนติดต่อผู้ใช้งาน
- **Blockchain Integration:**
  - **Viem:** Library สำหรับการจัดการ Smart Contract บนเครือข่าย EVM (Bitkub Chain)
  - **Smart Contract:** มีการแยก Smart Contract สำหรับ NFT และ Metadata Management
- **File Storage:** **Supabase Storage** ใช้สำหรับจัดเก็บไฟล์ที่อัปโหลด เช่น รูปภาพและไฟล์ Metadata JSON
- **Authentication:** ใช้ `clerk/nextjs` ร่วมกับการจัดการ State ด้วย `auth.context.tsx`
- **Data Validation:** **Zod** ใช้สำหรับตรวจสอบความถูกต้องของข้อมูล (Schema Validation) ทั้งฝั่ง Frontend และ Backend

---

### 5. แบบแผนการเขียนโค้ดและข้อตกลง (Code Convention & Agreements)

เพื่อให้การทำงานร่วมกันเป็นไปอย่างราบรื่นและคงคุณภาพของโค้ด ควรยึดตามหลักการดังนี้:

- **โครงสร้างโปรเจกต์ (Project Structure):** โค้ดถูกจัดแบ่งอย่างเป็นระบบตามหน้าที่การทำงาน (feature-based)
  - **`src/components/`**: สำหรับ Components ที่นำไปใช้ซ้ำได้ เช่น `LoginForm`, `BaseLayout`
  - **`src/pages/`**: สำหรับ Pages หลักของ Next.js
  - **`src/server/api/routers/`**: สำหรับ tRPC Routers แต่ละส่วนงาน (เช่น `r-auth`, `r-buffalo`) ซึ่งแยกตาม Domain
  - **`src/server/services/`**: สำหรับ Business Logic และการเชื่อมต่อกับ Service ภายนอก เช่น Supabase และ Database
- **การตั้งชื่อ (Naming Convention):**
  - ตัวแปรและฟังก์ชันใช้แบบ **camelCase**
  - ชื่อไฟล์ส่วนใหญ่ใช้ **PascalCase** สำหรับ Components และ **kebab-case** สำหรับไฟล์อื่นๆ เช่น `new-buffalo-info` หรือ `r-auth`
- **TypeScript & Type-Safety:** โปรเจกต์มีการบังคับใช้ TypeScript และ Zod อย่างเคร่งครัด ซึ่งทำให้โค้ดมีความน่าเชื่อถือและตรวจสอบข้อผิดพลาดได้ง่ายขึ้น
- **State Management:** ข้อมูลที่ใช้ร่วมกันระหว่าง Components ถูกจัดการผ่าน **Context API** (เช่น `auth.context.tsx`, `buffalo-info.context.tsx`) และใช้ **React Query** สำหรับการจัดการสถานะการ Fetching ข้อมูลจาก Backend
- **การจัดการ Environment Variables:** ใช้ `@t3-oss/env-nextjs` เพื่อ Validate Environment Variables ที่จำเป็น
- **การจัดการฐานข้อมูล (Database Management):** ใช้ Prisma CLI ในการจัดการ Schema และ Migrations

---

### 6. การวิเคราะห์ UI และข้อเสนอแนะในการ Refactor (UI Analysis & Refactoring Recommendations)

#### **การวิเคราะห์ UI (UI Analysis)**

ระบบใช้ **DaisyUI** ซึ่งเป็น Component Library บน **Tailwind CSS** ทำให้ UI มีความสอดคล้องกันและใช้ประโยชน์จาก Utility Classes ของ Tailwind ได้อย่างเต็มที่ โดยรวมแล้ว UI มีความเรียบง่ายและใช้งานได้ .

- **Pattern การแก้ไขข้อมูล:** ในส่วนของการแก้ไขข้อมูลควาย (`update-buffalo-info`) มีการสร้าง Modal Dialog (`<dialog>`) แยกสำหรับแต่ละข้อมูลที่ต้องการแก้ไข (เช่น `UpdateName.tsx`, `UpdateColor.tsx`, `UpdateHeight.tsx`) การออกแบบในลักษณะนี้ทำให้โค้ดมีความซ้ำซ้อนและกระจัดกระจายไปหลายไฟล์

#### **ข้อเสนอแนะในการ Refactor (Refactoring Recommendations)**

- **รวม Components สำหรับการแก้ไขข้อมูล:** ควรพิจารณารวม Modal Dialog ทั้งหมดสำหรับแก้ไขข้อมูลควายเข้าเป็น Component เดียว โดยใช้ Props เพื่อกำหนดว่าจะแสดง Form สำหรับข้อมูลใด (เช่น ชื่อ, สี, ความสูง). วิธีนี้จะช่วยลดความซ้ำซ้อนของโค้ดและทำให้การจัดการง่ายขึ้น
- **การจัดการ Modal:** สามารถใช้ไลบรารี State Management หรือ Context API เพื่อจัดการสถานะการเปิด/ปิด Modal และข้อมูลที่ส่งผ่าน Modal ได้อย่างมีประสิทธิภาพมากขึ้นแทนการใช้ `window.showModal()`
- **การจัดการฟอร์ม (Form Handling):** สำหรับฟอร์มที่มีความซับซ้อน เช่น การอัปเดตข้อมูลพ่อแม่ (`UpdateParentDialog.tsx`) ควรมีการตรวจสอบข้อมูลและสถานะการอัปเดตอย่างละเอียดในโค้ดฝั่ง Frontend เพื่อป้องกันปัญหาข้อมูลสูญหายหรืออัปเดตไม่ครบถ้วน

---

### 7. API Routes List (tRPC)

ต่อไปนี้คือรายการ API Routes ที่มีอยู่ในระบบ ซึ่งแบ่งตาม tRPC Routers:

#### **`buffalo` Router (`src/server/api/routers/r-buffalo.ts`)**

- **`create`**: สร้างข้อมูลควายใหม่ในฐานข้อมูล
- **`update`**: อัปเดตข้อมูลควายที่มีอยู่
- **`update-cert`**: อัปเดตข้อมูลใบรับรองของควาย
- **`get-all`**: ดึงข้อมูลควายทั้งหมดจากฐานข้อมูล
- **`get-by-microchip`**: ดึงข้อมูลควายด้วยหมายเลขไมโครชิป
- **`get-by-owner`**: ดึงข้อมูลควายด้วยรหัสเจ้าของ
- **`upload-image`**: อัปโหลดรูปภาพควายไปยัง Supabase Storage
- **`generate-metadata`**: สร้างไฟล์ Metadata JSON สำหรับ NFT
- **`mint`**: สร้าง NFT บน Bitkub Chain

#### **`auth` Router (`src/server/api/routers/r-auth.ts`)**

- **`login`**: สำหรับการเข้าสู่ระบบของผู้ดูแลระบบ

---

### 8. User Journey Flow (กระบวนการใช้งานของผู้ดูแลระบบ)

ส่วนนี้จะอธิบายขั้นตอนการทำงานของผู้ดูแลระบบในฟีเจอร์หลักของ Dashboard:

#### **8.1 Flow การเข้าสู่ระบบ (Login Flow)**

1.  **เข้าสู่ระบบ:** ผู้ดูแลระบบเข้าสู่หน้า Login
2.  **กรอกข้อมูล:** ผู้ดูแลระบบกรอก Username และ Password ในฟอร์ม
3.  **ตรวจสอบสิทธิ์:** ระบบส่งข้อมูลไปยัง Backend (`r-auth.ts`) เพื่อตรวจสอบว่าผู้ใช้มีสิทธิ์เป็น `ADMIN` หรือไม่
4.  **เข้าสู่ Dashboard:** หากข้อมูลถูกต้องและมีสิทธิ์เป็น `ADMIN` ระบบจะนำผู้ใช้เข้าสู่หน้าหลักของ Dashboard

#### **8.2 Flow การเพิ่มข้อมูลควายใหม่และ Mint NFT (Add New Buffalo & Mint NFT Flow)**

1.  **เริ่มต้น:** ผู้ดูแลระบบเข้าสู่หน้า `New Buffalo Info`
2.  **กรอกข้อมูลควาย:** กรอกข้อมูลพื้นฐานของควาย (ชื่อ, ไมโครชิป, เพศ, สี, ฯลฯ)
3.  **อัปโหลดรูปภาพ:** อัปโหลดรูปภาพควายผ่านฟอร์ม
4.  **สร้าง Metadata JSON:** ระบบสร้างไฟล์ JSON Metadata ตามข้อมูลที่กรอกและอัปโหลดรูปภาพไปยัง Supabase Storage
5.  **ยืนยันการ Mint:** ระบบจะแสดงข้อมูลที่พร้อมสำหรับการ Mint NFT
6.  **Mint NFT:** ผู้ดูแลระบบกดปุ่มเพื่อเริ่มกระบวนการ Mint NFT
7.  **บันทึกข้อมูล:** เมื่อการ Mint สำเร็จ ระบบจะบันทึกข้อมูลควายลงในฐานข้อมูล (PostgreSQL) ผ่าน tRPC API

#### **8.3 Flow การแก้ไขข้อมูลควาย (Update Buffalo Info Flow)**

1.  **ค้นหาควาย:** ผู้ดูแลระบบกรอกหมายเลขไมโครชิปเพื่อค้นหาควายที่ต้องการแก้ไข
2.  **แสดงข้อมูล:** ระบบแสดงข้อมูลควายที่ค้นหาพบ
3.  **เลือกข้อมูลที่ต้องการแก้ไข:** ผู้ดูแลระบบเลือกข้อมูลที่ต้องการอัปเดต (เช่น ชื่อ, สี, รูปภาพ)
4.  **เปิด Modal:** ระบบจะเปิด Modal Dialog ขึ้นมาสำหรับแก้ไขข้อมูลนั้นๆ
5.  **กรอกข้อมูลใหม่:** ผู้ดูแลระบบกรอกข้อมูลใหม่ใน Modal
6.  **อัปเดตข้อมูล:** เมื่อกดบันทึก ระบบจะส่งคำสั่งอัปเดตข้อมูลไปยัง Backend
7.  **อัปเดตฐานข้อมูล/Blockchain:** Backend จะทำการอัปเดตข้อมูลในฐานข้อมูล และหากเป็นข้อมูลที่เกี่ยวข้องกับ NFT (เช่น ชื่อ, รูปภาพ) ก็จะอัปเดต Metadata บน Blockchain ด้วย

---

### 9. แนวทางการค้นหาโค้ดตามการทำงาน (Code Location Guide)

เพื่อให้การทำงานต่อยอดหรือแก้ไขเป็นไปอย่างรวดเร็ว สามารถอ้างอิงตำแหน่งของโค้ดได้ดังนี้:

- **การจัดการข้อมูลควาย (เพิ่ม/แก้ไข):**
  - **หน้าจอ (UI Page):** `src/pages/dashboard/new-buffalo-info/index.tsx` (สำหรับเพิ่ม) และ `src/pages/dashboard/update-buffalo-info/index.tsx` (สำหรับแก้ไข)
  - **Components:** `src/components/new-buffalo-info/` (สำหรับเพิ่ม) และ `src/components/update-buffalo-info/` (สำหรับแก้ไข)
  - **API Logic:** `src/server/api/routers/r-buffalo.ts`
- **การจัดการผู้ดูแลระบบ (เข้าสู่ระบบ/ข้อมูลผู้ใช้งาน):**
  - **หน้าจอ (UI Component):** `src/components/auth/LoginForm.tsx`
  - **API Logic:** `src/server/api/routers/r-auth.ts`
- **การจัดการฐานข้อมูล (Prisma Schema):** `prisma/schema.prisma`
- **การจัดการการเชื่อมต่อ Blockchain:** `src/server/blockchain/`
- **การจัดการ Smart Contract และ Metadata:**
  - **Smart Contract Interfaces:** `src/server/blockchain/metadata-maneger/abi.ts` และ `src/server/blockchain/nft/abi.ts`
  - **Metadata Logic:** `src/server/blockchain/metadata.service.ts`
  - **JSON Generator:** `src/server/utils/jsonGenerator.ts`
- **การจัดการไฟล์ (อัปโหลดรูปภาพ/JSON):** `src/server/services/supabase/`
- **การจัดการ State ทั่วไปของระบบ:** `src/context/`
