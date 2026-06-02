import React from 'react';
import { Table as TableIcon, Target, Zap, ListChecks, Lightbulb, BookOpenCheck, FileCheck2, ClipboardCheck, LayoutDashboard, BarChart3, Download, CalendarDays } from 'lucide-react';

export const MENU_ITEMS = [
  { id: 'analysis', label: 'วิเคราะห์งาน/หน่วยการเรียนรู้', icon: <TableIcon size={20} /> },
  { id: 'learning_outcomes', label: 'ผลลัพธ์การเรียนรู้ประจำหน่วย', icon: <Target size={20} /> },
  { id: 'competencies', label: 'สมรรถนะประจำหน่วย', icon: <Zap size={20} /> },
  { id: 'objectives', label: 'จุดประสงค์เชิงพฤติกรรม', icon: <ListChecks size={20} /> },
  { id: 'concept', label: 'สาระการเรียนรู้', icon: <Lightbulb size={20} /> },
  { id: 'behavior_table', label: 'ตารางวิเคราะห์พฤติกรรม', icon: <BarChart3 size={20} /> },
  { id: 'activities', label: 'กิจกรรมการเรียนรู้', icon: <CalendarDays size={20} /> },
  { id: 'media', label: 'สื่อและแหล่งการเรียนรู้', icon: <BookOpenCheck size={20} /> },
  { id: 'evidence', label: 'หลักฐานการเรียนรู้', icon: <FileCheck2 size={20} /> },
  { id: 'assessment', label: 'การวัดและประเมินผล', icon: <ClipboardCheck size={20} /> },
  // 🚫 ปิดชั่วคราว — รอคำสั่งให้เปิด (uncomment บรรทัดล่างเพื่อเปิดอีกครั้ง)
  // { id: 'download', label: 'ดาวน์โหลด', icon: <Download size={20} /> },
  { id: 'admin', label: 'Admin Dashboard', icon: <LayoutDashboard size={20} />, isAdmin: true },
];
