import React, { useState, useMemo } from 'react';
import { usePersistedState } from './hooks/usePersistedState';
import { BookOpen, Menu, Table as TableIcon, AlertTriangle } from 'lucide-react';

import Sidebar from './components/layout/Sidebar';
import TopToolsBar from './components/layout/TopToolsBar';
import ErrorPopup from './components/common/ErrorPopup';
import PdfSplitterModal from './components/modals/PdfSplitterModal';
import StandardSearchPopup from './components/modals/StandardSearchPopup';
import ApiKeyModal from './components/modals/ApiKeyModal';
import UserInfoModal, { useDownloadWithUserInfo } from './components/modals/UserInfoModal';
import { useTrainingMode } from './hooks/useTrainingMode';
import TrainingBanner, { ModuleGate } from './components/common/TrainingBanner';
import TrainingAdminModal, { useTrainingAdminTrigger } from './components/modals/TrainingAdminModal';
import LoginGate from './components/auth/LoginGate';

import AnalysisModule from './components/modules/AnalysisModule';
import LearningOutcomesModule from './components/modules/LearningOutcomesModule';
import CompetencyModule from './components/modules/CompetencyModule';
import ObjectivesModule from './components/modules/ObjectivesModule';
import AdminDashboard from './components/modules/AdminDashboard';
import ConceptModule from './components/modules/ConceptModule';
import ActivitiesModule from './components/modules/ActivitiesModule';
import MediaModule from './components/modules/MediaModule';
import EvidenceModule from './components/modules/EvidenceModule';
import AssessmentModule from './components/modules/AssessmentModule';
import DownloadModule from './components/modules/DownloadModule';
import BehaviorTableModule from './components/modules/BehaviorTableModule';
// LessonPlanModule merged into ActivitiesModule (now "แผนรายสัปดาห์")

import { getStoredProvider, setStoredProvider, getStoredApiKey, setStoredApiKey, useAiApi } from './hooks/useAiApi';
import { getProviderMeta, DEFAULT_PROVIDER } from './providers/index';
import { SYSTEM_PROMPT_LO, SYSTEM_PROMPT_COMPETENCY, SYSTEM_PROMPT_OBJECTIVES, SYSTEM_PROMPT_CONCEPT } from './constants/prompts';
import { ADMIN_PASSWORD, ADMIN_VERIFIED_KEY } from './constants/adminAuth';

const EMPTY_FORM = {
  courseCode: '', courseName: '', credits: '', ratio: '',
  standardRef: '', learningOutcomes: '', objectives: '',
  competencies: '', description: '',
  // ── Cover page fields ──────────────────────────────────────
  courseCategory: 'vocational', // 'vocational' = หมวดวิชาชีพ | 'core' = สมรรถนะแกนกลาง
  competencyGroup: '', // เฉพาะเมื่อ courseCategory='core' (dropdown 3 ตัวเลือก)
};

export default function App() {
  return (
    <LoginGate>
      <AuthenticatedApp />
    </LoginGate>
  );
}

function AuthenticatedApp() {
  // --- AI Provider + Key (user must set their own) ---
  const [providerId, setProviderId] = useState(() => getStoredProvider() || DEFAULT_PROVIDER);
  const [apiKey, setApiKey] = useState(() => getStoredApiKey(getStoredProvider() || DEFAULT_PROVIDER));
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(!apiKey);

  const handleSaveProvider = (newProviderId, newKey) => {
    setStoredProvider(newProviderId);
    setStoredApiKey(newProviderId, newKey);
    setProviderId(newProviderId);
    setApiKey(newKey);
  };

  const providerMeta = getProviderMeta(providerId);

  // --- Download with user info ---
  const userInfoHook = useDownloadWithUserInfo();
  const training = useTrainingMode();
  const trainingAdmin = useTrainingAdminTrigger();

  // --- Global UI state ---
  const [activeMenu, setActiveMenu] = usePersistedState('lp_activeMenu', 'analysis');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = usePersistedState('pnp_sidebar_collapsed', false);
  const [error, setError] = useState(null);
  const [isPdfToolOpen, setIsPdfToolOpen] = useState(false);
  const [isStandardPopupOpen, setIsStandardPopupOpen] = useState(false);
  const [standardPastedText, setStandardPastedText] = useState('');

  // --- Shared data (persisted in localStorage) ---
  const [formData, setFormData] = usePersistedState('lp_formData', EMPTY_FORM);
  const [generatedPlan, setGeneratedPlan] = usePersistedState('lp_generatedPlan', null);
  const [unitDivisionPlan, setUnitDivisionPlan] = usePersistedState('lp_unitDivisionPlan', null);
  const [loResults, setLoResults] = usePersistedState('lp_loResults', null);
  const [compResults, setCompResults] = usePersistedState('lp_compResults', null);
  const [objResults, setObjResults] = usePersistedState('lp_objResults', null);
  const [conceptResults, setConceptResults] = usePersistedState('lp_conceptResults', null);
  const [activitiesResults, setActivitiesResults] = usePersistedState('lp_activitiesResults', null);
  const [mediaResults, setMediaResults] = usePersistedState('lp_mediaResults', null);
  const [evidenceResults, setEvidenceResults] = usePersistedState('lp_evidenceResults', null);
  const [assessmentResults, setAssessmentResults] = usePersistedState('lp_assessmentResults', null);
  const [questionBankResults, setQuestionBankResults] = usePersistedState('lp_questionBankResults', null);
  const [behaviorSelections, setBehaviorSelections] = usePersistedState('lp_behaviorSelections', {});
  const [lessonPlanResults, setLessonPlanResults] = usePersistedState('lp_lessonPlanResults', []);

  // ── Feature 2: Module completion status ──────────────────────────────────
  const moduleStatus = useMemo(() => ({
    analysis: !!generatedPlan,
    learning_outcomes: !!loResults,
    competencies: !!compResults,
    objectives: !!objResults,
    concept: !!conceptResults,
    behavior_table: behaviorSelections && Object.keys(behaviorSelections).length > 0,
    activities: !!activitiesResults,
    media: !!mediaResults,
    evidence: !!evidenceResults || !!activitiesResults,
    assessment: !!assessmentResults,
  }), [generatedPlan, loResults, compResults, objResults, conceptResults, behaviorSelections, activitiesResults, mediaResults, evidenceResults, assessmentResults]);

  // ── Feature 5: Stale data tracking ───────────────────────────────────────
  const [moduleTimestamps, setModuleTimestamps] = usePersistedState('lp_moduleTimestamps', {});
  const touchModule = (id) => setModuleTimestamps((prev) => ({ ...prev, [id]: Date.now() }));

  // Tracked setters — update timestamp when data is set (not cleared)
  const track = (setter, moduleId) => (val) => {
    setter(val);
    // Function updaters & null clears handled: only touch when truthy
    if (val !== null && val !== undefined && typeof val !== 'function') touchModule(moduleId);
    else if (typeof val === 'function') touchModule(moduleId); // function updater = data change
  };
  const setGeneratedPlanT      = track(setGeneratedPlan, 'analysis');
  const setUnitDivisionPlanT   = track(setUnitDivisionPlan, 'analysis');
  const setLoResultsT          = track(setLoResults, 'learning_outcomes');
  const setCompResultsT        = track(setCompResults, 'competencies');
  const setObjResultsT         = track(setObjResults, 'objectives');
  const setConceptResultsT     = track(setConceptResults, 'concept');
  const setActivitiesResultsT  = track(setActivitiesResults, 'activities');
  const setMediaResultsT       = track(setMediaResults, 'media');
  const setEvidenceResultsT    = track(setEvidenceResults, 'evidence');
  const setAssessmentResultsT  = track(setAssessmentResults, 'assessment');
  const setQuestionBankResultsT = track(setQuestionBankResults, 'assessment');
  const setBehaviorSelectionsT = track(setBehaviorSelections, 'behavior_table');

  // ── Clear downstream modules when a module regenerates ─────────────────
  const MODULE_ORDER = [
    'analysis','learning_outcomes','competencies','objectives',
    'concept','behavior_table','activities','media','evidence','assessment'
  ];
  const CLEAR_MAP = {
    analysis:          () => { setGeneratedPlan(null); setUnitDivisionPlan(null); },
    learning_outcomes: () => setLoResults(null),
    competencies:      () => setCompResults(null),
    objectives:        () => setObjResults(null),
    concept:           () => setConceptResults(null),
    behavior_table:    () => setBehaviorSelections({}),
    activities:        () => setActivitiesResults(null),
    media:             () => { setMediaResults(null); localStorage.removeItem('lp_jobSheetStore'); localStorage.removeItem('lp_infoSheetStore'); localStorage.removeItem('lp_operationSheetStore'); localStorage.removeItem('lp_assignmentSheetStore'); },
    evidence:          () => setEvidenceResults(null),
    assessment:        () => { setAssessmentResults(null); setQuestionBankResults(null); localStorage.removeItem('lp_assessmentStep'); localStorage.removeItem('lp_assessmentSelectedUnit'); localStorage.removeItem('lp_assessmentToolsData'); localStorage.removeItem('lp_affectiveData'); localStorage.removeItem('lp_qbShowAnswers'); localStorage.removeItem('lp_qbExpanded'); },
  };
  const clearDownstream = (moduleId) => {
    const idx = MODULE_ORDER.indexOf(moduleId);
    if (idx === -1) return;
    MODULE_ORDER.slice(idx + 1).forEach((m) => CLEAR_MAP[m]?.());
  };

  // Stale dependency map & warning renderer
  const MODULE_DEPS = {
    learning_outcomes: ['analysis'],
    competencies: ['learning_outcomes'],
    objectives: ['competencies', 'learning_outcomes'],
    concept: ['analysis', 'learning_outcomes', 'competencies', 'objectives'],
    behavior_table: ['objectives', 'activities'],
    activities: ['objectives', 'concept', 'competencies'],
    media: ['activities', 'concept', 'objectives'],
    evidence: ['objectives', 'competencies', 'activities'],
    assessment: ['objectives', 'competencies', 'evidence', 'activities'],
  };
  const DEP_LABELS = {
    analysis: 'วิเคราะห์งาน', learning_outcomes: 'ผลลัพธ์การเรียนรู้',
    competencies: 'สมรรถนะ', objectives: 'จุดประสงค์', concept: 'สาระการเรียนรู้',
    activities: 'กิจกรรม', media: 'สื่อ', evidence: 'หลักฐาน', assessment: 'การประเมิน',
  };
  const renderStaleWarning = (moduleId) => {
    const deps = MODULE_DEPS[moduleId];
    if (!deps) return null;
    const myTime = moduleTimestamps[moduleId] || 0;
    if (!myTime) return null;
    const stale = deps.filter((d) => (moduleTimestamps[d] || 0) > myTime);
    if (stale.length === 0) return null;
    return (
      <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-2">
        <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800">
          <span className="font-bold">ข้อมูลอาจไม่เป็นปัจจุบัน:</span>{' '}
          Module <strong>{stale.map((s) => DEP_LABELS[s]).join(', ')}</strong> มีการเปลี่ยนแปลงหลังจาก Module นี้สร้างข้อมูลแล้ว — กดสร้างใหม่เพื่ออัพเดต
        </div>
      </div>
    );
  };

  // ── Export refs (populated by AssessmentModule) ──────────────────────────
  const [exportFns, setExportFns] = useState({ word: null, pdf: null });

  // ── Feature 3: Backup / Restore (auto-detect ทุก lp_* key) ────────────────
  // Export: scan localStorage หา key ขึ้นต้น "lp_" ทั้งหมด → ใส่ใน backup
  // Import: เจอ key ขึ้น "lp_" ใน backup file → คืนเข้า localStorage ทั้งหมด
  // → อนาคตเพิ่ม store ใหม่ (lp_xxx) ไม่ต้องแก้ backup function อีก
  const handleExportProject = () => {
    const data = {
      _meta: { exportedAt: new Date().toISOString(), version: '3.1.0', app: 'ai-lesson-plannerv3-full', format: 'auto-detect' },
    };

    // 🔍 Auto-detect: backup ALL lp_* keys จาก localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('lp_')) {
        const v = localStorage.getItem(key);
        if (v != null) {
          try { data[key] = JSON.parse(v); }
          catch { data[key] = v; /* keep as string ถ้าไม่ใช่ JSON */ }
        }
      }
    }

    // Backward compat: เก็บ "named props" ด้วยสำหรับ backup เก่า ๆ ที่ใช้ format นี้
    Object.assign(data, {
      formData, generatedPlan, unitDivisionPlan,
      loResults, compResults, objResults, conceptResults,
      activitiesResults, mediaResults, evidenceResults,
      assessmentResults, questionBankResults, behaviorSelections,
      moduleTimestamps,
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = formData?.courseName || formData?.courseCode || 'lesson-plan';
    a.download = `${name.replace(/[/\\:*?"<>|\s]/g, '_')}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProject = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // 🔄 Auto-restore: คืน ALL lp_* keys จาก backup → localStorage
        Object.keys(data).forEach((key) => {
          if (key.startsWith('lp_') && data[key] !== undefined && data[key] !== null) {
            try {
              const value = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
              localStorage.setItem(key, value);
            } catch { /* skip key ที่ serialize ไม่ได้ */ }
          }
        });

        // คืน React state ของ App.jsx (สำหรับ field ที่ component นี้จัดการ)
        // backward compat: รองรับทั้ง "named props" (เก่า) และ "lp_*" (ใหม่)
        handleImportData(data);
        if (data.moduleTimestamps) setModuleTimestamps(data.moduleTimestamps);

        // ⚠️ Note: module-level state (เช่น MediaModule's infoSheetStore) จะ
        // refresh เฉพาะเมื่อ remount หรือ reload page เพราะ usePersistedState
        // อ่าน localStorage เฉพาะตอน initial render
        // → แสดง message ให้ user reload เพื่อความแน่ใจ
        setError('นำเข้าข้อมูลสำเร็จ ✓ — ระบบจะ refresh หน้าเว็บใน 2 วินาที เพื่อโหลดข้อมูลใหม่ครบถ้วน');
        setTimeout(() => window.location.reload(), 2000);
      } catch {
        setError('ไม่สามารถอ่านไฟล์สำรองได้ กรุณาตรวจสอบไฟล์');
      }
    };
    reader.readAsText(file);
  };

  const clearAllData = () => {
    const keys = [
      'lp_activeMenu','lp_formData','lp_generatedPlan','lp_unitDivisionPlan',
      'lp_loResults','lp_compResults','lp_objResults','lp_conceptResults',
      'lp_activitiesResults','lp_mediaResults','lp_evidenceResults','lp_assessmentResults','lp_questionBankResults','lp_behaviorSelections','lp_lessonPlanResults',
      // MediaModule per-unit job sheet store
      'lp_jobSheetStore',
      // AssessmentModule local persistence
      'lp_assessmentStep','lp_assessmentSelectedUnit','lp_assessmentToolsData',
      'lp_affectiveData','lp_qbShowAnswers','lp_qbExpanded',
    ];
    keys.forEach(k => localStorage.removeItem(k));
    setFormData(EMPTY_FORM);
    setGeneratedPlan(null);
    setUnitDivisionPlan(null);
    setLoResults(null);
    setCompResults(null);
    setObjResults(null);
    setConceptResults(null);
    setActivitiesResults(null);
    setMediaResults(null);
    setEvidenceResults(null);
    setAssessmentResults(null);
    setQuestionBankResults(null);
    setBehaviorSelections({});
    setLessonPlanResults([]);
    setModuleTimestamps({});
    setActiveMenu('analysis');
  };

  const navigate = (menuId) => setActiveMenu(menuId);

  // ── Secret Batch Trigger: รัน 4 modules แรกอัตโนมัติ (LO → Comp → Obj → Concept) ──
  const { callApi: batchCallApi } = useAiApi(providerId, apiKey);
  const [batchProgress, setBatchProgress] = useState({ active: false, current: 0, total: 4, label: '', error: null });
  const runBatchEarlyModules = async () => {
    // Pre-condition check
    if (!unitDivisionPlan || !generatedPlan) {
      alert('⚠️ กรุณาทำขั้นตอน "วิเคราะห์งาน/หน่วยการเรียนรู้" ให้เสร็จก่อนใช้ปุ่มลับ');
      setActiveMenu('analysis');
      return;
    }
    if (!apiKey) {
      alert('⚠️ กรุณาตั้งค่า API Key ก่อน — กดปุ่ม "ตั้งค่า AI" ด้านบน');
      setIsApiKeyModalOpen(true);
      return;
    }

    // Admin code check (share with MediaModule)
    if (localStorage.getItem(ADMIN_VERIFIED_KEY) !== '1') {
      const code = window.prompt('🔒 ปุ่มลับ — กรุณาใส่รหัสผู้ดูแลระบบ');
      if (code === null) return;
      if (code.trim() !== ADMIN_PASSWORD) {
        alert('❌ รหัสผู้ดูแลระบบไม่ถูกต้อง');
        return;
      }
      localStorage.setItem(ADMIN_VERIFIED_KEY, '1');
    }

    setBatchProgress({ active: true, current: 0, total: 4, label: 'เริ่มต้น...', error: null });
    let currentLO = null, currentComp = null, currentObj = null;

    try {
      // Step 1: Learning Outcomes (LO)
      setBatchProgress({ active: true, current: 1, total: 4, label: 'ผลลัพธ์การเรียนรู้ประจำหน่วย', error: null });
      const loParts = [
        { text: SYSTEM_PROMPT_LO },
        { text: `\n\n--- Content 1: ตารางหน่วยการเรียนรู้ ---\n${unitDivisionPlan}` },
        { text: `\n\n--- Content 2: ตารางวิเคราะห์งาน ---\n${generatedPlan}` },
      ];
      currentLO = await batchCallApi(loParts, { json: true, statusText: 'กำลังวิเคราะห์ผลลัพธ์การเรียนรู้...' });
      setLoResultsT(currentLO);

      // Step 2: Competencies (Comp) — ใช้ courseCode บอกระดับ
      setBatchProgress({ active: true, current: 2, total: 4, label: 'สมรรถนะประจำหน่วย', error: null });
      const selectedLevel = formData?.courseCode?.startsWith('3') ? 'ปวส.' : 'ปวช.';
      const unitsText = (currentLO || []).map((u) => `Unit: ${u.unitName}\nOutcome: ${u.outcome}`).join('\n\n');
      const compParts = [
        { text: SYSTEM_PROMPT_COMPETENCY(selectedLevel) },
        { text: `\n\n--- ข้อมูลหน่วยและผลลัพธ์การเรียนรู้ ---\n${unitsText}` },
      ];
      const compRaw = await batchCallApi(compParts, { json: true, statusText: 'กำลังเขียนสมรรถนะประจำหน่วย...' });
      currentComp = compRaw?.units || compRaw;
      setCompResultsT(currentComp);

      // Step 3: Objectives (Obj)
      setBatchProgress({ active: true, current: 3, total: 4, label: 'จุดประสงค์เชิงพฤติกรรม', error: null });
      const objParts = [
        { text: SYSTEM_PROMPT_OBJECTIVES },
        { text: `\n\n--- Course Syllabus ---\n${JSON.stringify(formData)}` },
        { text: `\n\n--- Unit Competencies ---\n${JSON.stringify(currentComp)}` },
        { text: `\n\n--- Unit Learning Outcomes ---\n${JSON.stringify(currentLO)}` },
      ];
      currentObj = await batchCallApi(objParts, { json: true, statusText: 'กำลังวิเคราะห์จุดประสงค์เชิงพฤติกรรม...' });
      setObjResultsT(currentObj);

      // Step 4: Concept (สาระการเรียนรู้)
      setBatchProgress({ active: true, current: 4, total: 4, label: 'สาระการเรียนรู้', error: null });
      const conceptParts = [
        { text: SYSTEM_PROMPT_CONCEPT },
        { text: `\n\n--- 1. Course Syllabus ---\n${JSON.stringify(formData)}` },
        { text: `\n\n--- 2. Job Analysis ---\n${generatedPlan}` },
        { text: `\n\n--- 3. Learning Units ---\n${unitDivisionPlan}` },
        { text: `\n\n--- 4. Outcomes ---\n${JSON.stringify(currentLO)}` },
        { text: `\n\n--- 5. Competencies ---\n${JSON.stringify(currentComp)}` },
        { text: `\n\n--- 6. Objectives ---\n${JSON.stringify(currentObj)}` },
      ];
      const conceptData = await batchCallApi(conceptParts, { json: true, statusText: 'กำลังสรุปสาระการเรียนรู้ประจำหน่วย...' });
      setConceptResultsT(conceptData);

      setBatchProgress({ active: false, current: 4, total: 4, label: '', error: null });
      setTimeout(() => alert('✅ ปุ่มลับ: สร้าง 4 modules สำเร็จ!'), 100);
      setActiveMenu('activities');
    } catch (err) {
      console.error('[BatchRun] Failed:', err);
      setBatchProgress((prev) => ({ ...prev, active: false, error: err.message || 'เกิดข้อผิดพลาด' }));
      setTimeout(() => alert(`❌ ล้มเหลวที่ขั้นตอน "${batchProgress.label}": ${err.message || 'unknown'}`), 100);
    }
  };

  // ── Import all data from JSON ─────────────────────────────────────────────
  const handleImportData = (data) => {
    if (data.formData) setFormData(data.formData);
    if (data.generatedPlan !== undefined) setGeneratedPlan(data.generatedPlan);
    if (data.unitDivisionPlan !== undefined) setUnitDivisionPlan(data.unitDivisionPlan);
    if (data.loResults !== undefined) setLoResults(data.loResults);
    if (data.compResults !== undefined) setCompResults(data.compResults);
    if (data.objResults !== undefined) setObjResults(data.objResults);
    if (data.conceptResults !== undefined) setConceptResults(data.conceptResults);
    if (data.activitiesResults !== undefined) setActivitiesResults(data.activitiesResults);
    if (data.mediaResults !== undefined) setMediaResults(data.mediaResults);
    if (data.evidenceResults !== undefined) setEvidenceResults(data.evidenceResults);
    if (data.assessmentResults !== undefined) setAssessmentResults(data.assessmentResults);
    if (data.questionBankResults !== undefined) setQuestionBankResults(data.questionBankResults);
    if (data.behaviorSelections !== undefined) setBehaviorSelections(data.behaviorSelections);
  };

  const aiProps = { providerId, apiKey, triggerDownload: userInfoHook.triggerDownload };

  // ── Feature 1: Export All as ZIP ─────────────────────────────────────────
  const [exportAllLoading, setExportAllLoading] = useState(false);
  const handleExportAll = async () => {
    setExportAllLoading(true);
    try {
      const { exportAllZip } = await import('./utils/docxTemplateExport');
      const { getStoredUserInfo } = await import('./components/modals/UserInfoModal');
      const userInfo = getStoredUserInfo() || {};
      const { exported, errors } = await exportAllZip({
        formData, generatedPlan, unitDivisionPlan,
        loResults, compResults, objResults, conceptResults,
        activitiesResults, mediaResults, evidenceResults,
        assessmentResults,
        userInfo,  // 🆕 ส่ง user info ให้ generateCoverBlob
      });
      if (errors && errors.length > 0) {
        setError(`ส่งออก ${exported} ไฟล์สำเร็จ แต่มีข้อผิดพลาดบางรายการ: ${errors.join('; ')}`);
      }
    } catch (err) {
      setError(`ส่งออกไม่สำเร็จ: ${err.message || ''}`);
    } finally {
      setExportAllLoading(false);
    }
  };

  const renderModule = () => {
    switch (activeMenu) {
      case 'analysis':
        return (
          <div className="pnp-shell-card rounded-xl p-5 md:p-6 min-h-[80vh]">
            <div className="mb-6 border-b border-gray-100 pb-4">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <TableIcon className="text-blue-600" /> วิเคราะห์งาน/หน่วยการเรียนรู้
              </h2>
              <p className="text-gray-500 text-sm mt-1">วิเคราะห์หลักสูตรเพื่อกำหนดงาน (Job) หน้าที่ (Duty) และงานย่อย (Task)</p>
            </div>
            <AnalysisModule
              {...aiProps}
              formData={formData} setFormData={setFormData}
              generatedPlan={generatedPlan} setGeneratedPlan={setGeneratedPlanT}
              unitDivisionPlan={unitDivisionPlan} setUnitDivisionPlan={setUnitDivisionPlanT}
              onError={setError} onNavigate={navigate}
              onOpenStandardSearch={() => setIsStandardPopupOpen(true)}
              standardPastedText={standardPastedText} setStandardPastedText={setStandardPastedText}
              onRegenerate={() => clearDownstream('analysis')}
            />
          </div>
        );
      case 'learning_outcomes':
        return (
          <>{renderStaleWarning('learning_outcomes')}
          <LearningOutcomesModule
            {...aiProps}
            unitDivisionPlan={unitDivisionPlan} generatedPlan={generatedPlan}
            loResults={loResults} setLoResults={setLoResultsT}
            formData={formData} onError={setError} onNavigate={navigate}
            onRegenerate={() => clearDownstream('learning_outcomes')}
          /></>
        );
      case 'competencies':
        return (
          <>{renderStaleWarning('competencies')}
          <CompetencyModule
            {...aiProps}
            loResults={loResults} unitDivisionPlan={unitDivisionPlan}
            compResults={compResults} setCompResults={setCompResultsT}
            formData={formData} onError={setError} onNavigate={navigate}
            onRegenerate={() => clearDownstream('competencies')}
          /></>
        );
      case 'objectives':
        return (
          <>{renderStaleWarning('objectives')}
          <ObjectivesModule
            {...aiProps}
            formData={formData} compResults={compResults} loResults={loResults}
            objResults={objResults} setObjResults={setObjResultsT}
            onError={setError} onNavigate={navigate}
            onRegenerate={() => clearDownstream('objectives')}
          /></>
        );
      case 'concept':
        return (
          <>{renderStaleWarning('concept')}
          <ConceptModule
            {...aiProps}
            formData={formData} generatedPlan={generatedPlan}
            unitDivisionPlan={unitDivisionPlan} loResults={loResults}
            compResults={compResults} objResults={objResults}
            conceptResults={conceptResults} setConceptResults={setConceptResultsT}
            onError={setError} onNavigate={navigate}
            onRegenerate={() => clearDownstream('concept')}
          /></>
        );
      case 'activities':
        return (
          <>{renderStaleWarning('activities')}
          <ActivitiesModule
            {...aiProps}
            formData={formData}
            unitDivisionPlan={unitDivisionPlan} loResults={loResults}
            compResults={compResults} objResults={objResults} conceptResults={conceptResults}
            activitiesResults={activitiesResults} setActivitiesResults={setActivitiesResultsT}
            mediaResults={mediaResults} evidenceResults={evidenceResults}
            assessmentResults={assessmentResults}
            questionBankResults={questionBankResults}
            behaviorSelections={behaviorSelections}
            lessonPlanResults={lessonPlanResults} setLessonPlanResults={setLessonPlanResults}
            onError={setError} onNavigate={navigate}
            onRegenerate={() => clearDownstream('activities')}
          /></>
        );
      case 'media':
        return (
          <>{renderStaleWarning('media')}
          <MediaModule
            {...aiProps}
            formData={formData}
            unitDivisionPlan={unitDivisionPlan}
            loResults={loResults} compResults={compResults}
            objResults={objResults} conceptResults={conceptResults}
            activitiesResults={activitiesResults}
            mediaResults={mediaResults} setMediaResults={setMediaResultsT}
            assessmentResults={assessmentResults}
            onError={setError} onNavigate={navigate}
            onRegenerate={() => clearDownstream('media')}
          /></>
        );
      case 'evidence':
        return (
          <>{renderStaleWarning('evidence')}
          <EvidenceModule
            {...aiProps}
            formData={formData}
            unitDivisionPlan={unitDivisionPlan}
            loResults={loResults}
            objResults={objResults} compResults={compResults}
            conceptResults={conceptResults} activitiesResults={activitiesResults}
            questionBankResults={questionBankResults}
            evidenceResults={evidenceResults} setEvidenceResults={setEvidenceResultsT}
            onError={setError} onNavigate={navigate}
          /></>
        );
      case 'assessment':
        return (
          <>{renderStaleWarning('assessment')}
          <AssessmentModule
            {...aiProps}
            formData={formData} generatedPlan={generatedPlan}
            unitDivisionPlan={unitDivisionPlan}
            loResults={loResults} compResults={compResults}
            objResults={objResults} conceptResults={conceptResults}
            activitiesResults={activitiesResults} mediaResults={mediaResults}
            evidenceResults={evidenceResults}
            questionBankResults={questionBankResults} setQuestionBankResults={setQuestionBankResultsT}
            assessmentResults={assessmentResults} setAssessmentResults={setAssessmentResultsT}
            onError={setError} onNavigate={navigate} onImportData={handleImportData} onExportReady={setExportFns}
            onRegenerate={() => clearDownstream('assessment')}
          /></>
        );
      // lesson_plan case removed — merged into ActivitiesModule
      case 'admin':
        return <AdminDashboard />;
      case 'behavior_table':
        return (
          <>{renderStaleWarning('behavior_table')}
          <BehaviorTableModule
            {...aiProps}
            formData={formData}
            unitDivisionPlan={unitDivisionPlan}
            objResults={objResults}
            activitiesResults={activitiesResults}
            loResults={loResults}
            behaviorSelections={behaviorSelections}
            setBehaviorSelections={setBehaviorSelectionsT}
            onError={setError}
            onNavigate={navigate}
            onRegenerate={() => clearDownstream('behavior_table')}
          /></>
        );
      case 'download':
        // 🚫 ปิดชั่วคราว — รอคำสั่งให้เปิด
        return (
          <div className="pnp-shell-card rounded-xl p-8 min-h-[60vh] flex flex-col items-center justify-center text-center">
            <div className="bg-gray-100 rounded-full p-5 mb-4">
              <Menu size={32} className="text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-700 mb-2">โมดูลดาวน์โหลดถูกปิดชั่วคราว</h2>
            <p className="text-gray-500 text-sm mb-6">โมดูลนี้กำลังอยู่ระหว่างปรับปรุง</p>
            <button
              onClick={() => setActiveMenu('analysis')}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition"
            >
              กลับไปหน้าหลัก
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen font-sans pb-10 text-slate-800">
      <TrainingBanner session={training.session} onLeave={training.leaveTraining} />
      <ErrorPopup message={error} onClose={() => setError(null)} />
      <StandardSearchPopup
        isOpen={isStandardPopupOpen}
        onClose={() => setIsStandardPopupOpen(false)}
      />
      <PdfSplitterModal isOpen={isPdfToolOpen} onClose={() => setIsPdfToolOpen(false)} />
      <UserInfoModal isOpen={userInfoHook.isOpen} onSubmit={userInfoHook.handleSubmit} onClose={userInfoHook.handleClose} />
      <TrainingAdminModal isOpen={trainingAdmin.isOpen} onClose={trainingAdmin.close} initialTab={trainingAdmin.initialTab} />
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSave={handleSaveProvider}
        currentProvider={providerId}
        currentKey={apiKey}
      />

      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="max-w-[1480px] mx-auto px-3 sm:px-4 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-800 to-sky-500 text-white flex items-center justify-center shadow-sm ring-1 ring-blue-200">
              <BookOpen size={23} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-blue-600 font-extrabold">PNP Platform</div>
              <h1 className="text-base sm:text-xl font-extrabold text-slate-950 leading-tight truncate">PNP AI Lesson Planner</h1>
              <p className="hidden sm:block text-xs text-slate-500 truncate">ผู้ช่วย AI สร้างแผนการจัดการเรียนรู้รายวิชา</p>
            </div>
          </div>
          <div className="w-full xl:flex-1 xl:min-w-0 flex items-start gap-2">
            <TopToolsBar
              embedded
              onOpenPdfTool={() => setIsPdfToolOpen(true)}
              onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
              providerName={providerMeta?.name || ''}
              providerId={providerId}
              apiKey={apiKey}
              onExportAll={handleExportAll}
              exportAllLoading={exportAllLoading}
            />
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden h-10 w-10 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 flex items-center justify-center shrink-0"
              aria-label="Toggle menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex max-w-[1480px] mx-auto pt-4 px-3 sm:px-4 gap-4 lg:gap-5 items-start">
        <aside className={`${isMobileMenuOpen ? 'block' : 'hidden'} md:block w-full ${isSidebarCollapsed ? 'md:w-20' : 'md:w-80'} shrink-0 z-20 transition-[width] duration-200`}>
          <Sidebar
            activeMenu={activeMenu} setActiveMenu={setActiveMenu}
            onMobileClose={() => setIsMobileMenuOpen(false)}
            moduleStatus={moduleStatus}
            onExportProject={handleExportProject}
            onImportProject={handleImportProject}
            onOpenAdminPool={trainingAdmin.openPool}
            collapsed={isSidebarCollapsed && !isMobileMenuOpen}
            onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
          />
        </aside>
        <main className="flex-1 min-w-0">
          <ModuleGate enabled={training.isModuleEnabled(activeMenu)} moduleName={activeMenu}>
            {renderModule()}
          </ModuleGate>
        </main>
      </div>

      {/* ── Secret Batch Run Modal ─────────────────────────────────────── */}
      {batchProgress.active && (
        <div className="fixed inset-0 bg-slate-950/70 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="pnp-shell-card rounded-xl max-w-md w-full p-8 relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-gradient-to-br from-blue-700 to-sky-500 p-3 rounded-xl shadow-lg shadow-blue-700/20">
                  <BookOpen className="text-white" size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-800">⚡ ปุ่มลับ: สร้าง 4 ขั้นตอนอัตโนมัติ</h3>
                  <p className="text-xs text-gray-500">โปรดรอ — กำลังสร้างโดย AI</p>
                </div>
              </div>

              <div className="my-5">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">ขั้นตอนที่</span>
                  <span className="font-bold text-blue-700">{batchProgress.current} / {batchProgress.total}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-700 to-sky-500 transition-all duration-500"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700" />
                <div>
                  <div className="text-xs text-gray-500">กำลังสร้าง</div>
                  <div className="font-bold text-blue-950">{batchProgress.label}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-[11px]">
                {['LO', 'Comp', 'Obj', 'Concept'].map((name, i) => (
                  <div
                    key={i}
                    className={`text-center py-2 rounded-lg border ${
                      batchProgress.current > i ? 'bg-green-100 border-green-300 text-green-700 font-bold' :
                      batchProgress.current === i + 1 ? 'bg-blue-100 border-blue-300 text-blue-700 font-bold animate-pulse' :
                      'bg-gray-50 border-gray-200 text-gray-400'
                    }`}
                  >
                    {batchProgress.current > i ? '✅' : batchProgress.current === i + 1 ? '⚡' : '⏳'} {name}
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-500 italic mt-4 text-center">
                ⏱️ ใช้เวลาประมาณ 2-4 นาที — ห้ามปิดหน้าต่าง
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
