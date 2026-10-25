import type { Candidate, CandidateLossReason, CandidateMeetingResult, CandidateSource, CandidateStage, CandidateStatus, JobOpening } from '../types/index.ts';

export const candidateStageLabels: Record<CandidateStage, string> = {
  resume_sent: 'ارسال رزومه', form_filling: 'در حال پر کردن فرم', unavailable: 'عدم امکان همکاری', rejected_by_us: 'رد شد از سمت ما', rejected_by_candidate: 'رد شد از سمت متقاضی',
  initial_meeting: 'جلسه اولیه', project_manager_intro: 'معرفی به مدیر پروژه', secondary_meeting: 'جلسه ثانویه', follow_up_call: 'تماس مجدد', candidate_message: 'ارسال پیام متقاضی',
  project_mismatch: 'عدم توانایی فرد با پروژه مد نظر', no_response: 'عدم پاسخگویی', follow_up_again: 'پیگیری مجدد',
};

export const candidateStatusLabels: Record<CandidateStatus, string> = {
  open: 'باز', closed: 'بسته', lost: 'از دست رفته', pending: 'معلق یا در انتظار', selected: 'منتخب شد', terminated: 'خاتمه', mismatch: 'نا هماهنگی', terminating: 'در حال خاتمه',
};

export const candidateSourceLabels: Record<CandidateSource, string> = { divar: 'دیوار', jobinja: 'جابینجا', ponisha: 'پونیشا', other: 'سایر' };

export const candidateLossReasonLabels: Record<CandidateLossReason, string> = {
  long_process: 'فرایند طولانی', other_reasons: 'دلایل دیگر', financial_mismatch: 'عدم تعامل مالی', work_conditions_mismatch: 'عدم تعامل شرایط کاری',
  poor_communication: 'عدم ارتباط مناسب', employed_elsewhere: 'مشغول به کار', no_response: 'عدم پاسخ گویی فرد',
};

export const candidateMeetingResultLabels: Record<CandidateMeetingResult, string> = {
  successful: 'موفق', next_meeting_needed: 'نیاز به جلسه بعدی', more_review_needed: 'نیاز به بررسی بیشتر', rejected: 'رد شد', no_show: 'عدم حضور', cancelled: 'لغو شد', pending_decision: 'در انتظار تصمیم', selected: 'منتخب شد',
};

export const candidateStatusColor = (status: CandidateStatus): 'default' | 'success' | 'warning' | 'error' | 'info' => {
  if (status === 'selected') return 'success';
  if (['lost', 'terminated', 'mismatch'].includes(status)) return 'error';
  if (['pending', 'terminating'].includes(status)) return 'warning';
  if (status === 'open') return 'info';
  return 'default';
};

export const candidateStageColor = (stage: CandidateStage): 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' => {
  if (['rejected_by_us', 'rejected_by_candidate', 'unavailable', 'project_mismatch'].includes(stage)) return 'error';
  if (stage === 'no_response') return 'warning';
  if (['initial_meeting', 'secondary_meeting'].includes(stage)) return 'primary';
  if (stage === 'project_manager_intro') return 'secondary';
  if (['follow_up_call', 'candidate_message', 'follow_up_again'].includes(stage)) return 'warning';
  if (stage === 'form_filling') return 'info';
  if (stage === 'resume_sent') return 'success';
  return 'default';
};

export const candidateNeedsLossReason = (status: CandidateStatus) => status === 'lost' || status === 'closed';

const statusRequiredByStage: Partial<Record<CandidateStage, CandidateStatus>> = {
  unavailable: 'lost',
  rejected_by_us: 'lost',
  rejected_by_candidate: 'lost',
  project_mismatch: 'mismatch',
};

export function candidateWorkflowAfterStageChange(stage: CandidateStage, currentStatus: CandidateStatus) {
  const requiredStatus = statusRequiredByStage[stage];
  if (requiredStatus) return { stage, status: requiredStatus };
  return { stage, status: currentStatus === 'lost' || currentStatus === 'mismatch' ? 'open' as const : currentStatus };
}

export function candidateWorkflowAfterStatusChange(status: CandidateStatus, currentStage: CandidateStage) {
  if (status === 'mismatch') return { stage: 'project_mismatch' as const, status };
  if (['open', 'pending', 'selected'].includes(status) && statusRequiredByStage[currentStage]) {
    return { stage: status === 'selected' ? 'secondary_meeting' as const : 'resume_sent' as const, status };
  }
  return { stage: currentStage, status };
}

export function normalizeCandidateWorkflow(stage: CandidateStage, status: CandidateStatus) {
  const requiredStatus = statusRequiredByStage[stage];
  if (requiredStatus) return { stage, status: requiredStatus };
  if (status === 'mismatch') return { stage: 'project_mismatch' as const, status };
  return { stage, status };
}

export function isCandidateWorkflowConsistent(stage: CandidateStage, status: CandidateStatus) {
  const normalized = normalizeCandidateWorkflow(stage, status);
  return normalized.stage === stage && normalized.status === status;
}

export function validateCandidate(candidate: Omit<Candidate, 'id' | 'appliedAt' | 'updatedAt'>) {
  const errors: string[] = [];
  if (!candidate.jobId) errors.push('موقعیت استخدامی');
  if (!candidate.ownerId) errors.push('مسئول پیگیری');
  if (!candidate.fullName.trim()) errors.push('نام و نام خانوادگی');
  if (!candidate.phone.trim()) errors.push('شماره تماس');
  if (!candidate.email.trim() || !/^\S+@\S+\.\S+$/.test(candidate.email)) errors.push('ایمیل معتبر');
  if (!Number.isFinite(candidate.grade) || candidate.grade < 0 || candidate.grade > 100) errors.push('امتیاز بین ۰ تا ۱۰۰');
  if (candidate.meetings.some((meeting) => !meeting.date || !meeting.result)) errors.push('اطلاعات کامل جلسه');
  return errors;
}

export function validateJobOpening(job: Omit<JobOpening, 'id' | 'applicants'>) {
  const errors: string[] = [];
  if (!job.title.trim()) errors.push('عنوان موقعیت');
  if (!job.department.trim()) errors.push('واحد سازمانی');
  if (!Number.isInteger(job.openings) || job.openings < 1) errors.push('ظرفیت معتبر');
  if (!job.postedAt) errors.push('تاریخ انتشار');
  return errors;
}
