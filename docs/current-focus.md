# Current Focus

ผมกำลังจะทำการ update ตรงขั้นตอนในการ สร้าง new-buffalo หรือบันทึกข้อมูล pedigree ควายใหม่ครับ โดยมันจะมี step ที่ mint nft แล้วต้องรอ ให้มีการ confirm transaction ก่อนแล้วถึงจะสามารถ add metadata เข้าไปได้ครับ step ที่ว่านี้จะอยู่ใน Minting.tsx ความต้องการของผมคือ ต้องการเพิ่ม countdown timer ที่ตัว ปุ่ม หลังจากที่ขึ้นว่า mint เรียบร้อยแล้ว เพิ่ม metadata ได้เลย ตรงนี้ให้มี countdown timer และ ยัง disabled ที่ปุ่ม Minting.tsx 82-88 นี้ก่อน 30s เพื่ออนุมานว่าได้ทำการ mint เรียบร้อยแล้วจริง แล้วค่อยให้ enabled ให้ user กด ครับ

**Updated**: $(date)