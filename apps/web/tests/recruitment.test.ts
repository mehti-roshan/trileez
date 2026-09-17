import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { candidates, employees, jobOpenings } from '../src/mock/data.ts';
import type { Candidate } from '../src/types/index.ts';
import { candidateMeetingResultLabels, candidateSourceLabels, candidateStageColor, candidateStageLabels, candidateStatusLabels, candidateWorkflowAfterStageChange, candidateWorkflowAfterStatusChange, isCandidateWorkflowConsistent, validateCandidate, validateJobOpening } from '../src/utils/recruitment.ts';

const asInput = (candidate: Candidate): Omit<Candidate, 'id' | 'appliedAt' | 'updatedAt'> => ({
  jobId: candidate.jobId, ownerId: candidate.ownerId, fullName: candidate.fullName, phone: candidate.phone, email: candidate.email,
  resume: candidate.resume, grade: candidate.grade, description: candidate.description, stage: candidate.stage, status: candidate.status,
  source: candidate.source, otherSource: candidate.otherSource, lossReason: candidate.lossReason, meetings: candidate.meetings,
});

test('recruitment enums expose all requested workflow values', () => {
  assert.equal(Object.keys(candidateStageLabels).length, 13);
  assert.equal(Object.keys(candidateStatusLabels).length, 8);
  assert.deepEqual(Object.values(candidateSourceLabels), ['دیوار', 'جابینجا', 'پونیشا', 'سایر']);
  assert.equal(Object.keys(candidateMeetingResultLabels).length, 8);
});

test('candidate stages have semantic color coding', () => {
  assert.equal(candidateStageColor('resume_sent'), 'success');
  assert.equal(candidateStageColor('initial_meeting'), 'primary');
  assert.equal(candidateStageColor('follow_up_again'), 'warning');
  assert.equal(candidateStageColor('rejected_by_us'), 'error');
});

test('mock candidates use existing recruitment and employee relationships', () => {
  candidates.forEach((candidate) => {
    assert.ok(jobOpenings.some((job) => job.id === candidate.jobId), `${candidate.id} must reference a job opening`);
    assert.ok(employees.some((employee) => employee.id === candidate.ownerId), `${candidate.id} must reference an employee`);
    assert.deepEqual(validateCandidate(asInput(candidate)), [], `${candidate.id} must be valid`);
    assert.equal(isCandidateWorkflowConsistent(candidate.stage, candidate.status), true, `${candidate.id} must have a coherent stage and status`);
    candidate.meetings.forEach((meeting) => assert.ok(candidateMeetingResultLabels[meeting.result]));
  });
});

test('inline workflow changes keep candidate stage and status coherent', () => {
  assert.deepEqual(candidateWorkflowAfterStageChange('rejected_by_us', 'open'), { stage: 'rejected_by_us', status: 'lost' });
  assert.deepEqual(candidateWorkflowAfterStageChange('initial_meeting', 'lost'), { stage: 'initial_meeting', status: 'open' });
  assert.deepEqual(candidateWorkflowAfterStatusChange('open', 'rejected_by_candidate'), { stage: 'resume_sent', status: 'open' });
  assert.deepEqual(candidateWorkflowAfterStatusChange('mismatch', 'form_filling'), { stage: 'project_mismatch', status: 'mismatch' });
});

test('candidate grade and meeting information are validated', () => {
  const candidate = asInput(candidates[0]);
  assert.deepEqual(validateCandidate({ ...candidate, grade: 101 }), ['امتیاز بین ۰ تا ۱۰۰']);
  assert.deepEqual(validateCandidate({ ...candidate, meetings: [{ id: 'm1', date: '', result: 'successful' }] }), ['اطلاعات کامل جلسه']);
});

test('other source and loss reason remain optional', () => {
  const candidate = asInput(candidates[0]);
  assert.deepEqual(validateCandidate({ ...candidate, source: 'other', otherSource: undefined, status: 'lost', lossReason: undefined }), []);
});

test('mock recruitment data includes candidate meetings for today and future reminders', () => {
  const meetingDates = candidates.flatMap((candidate) => candidate.meetings.map((meeting) => meeting.date));
  assert.ok(meetingDates.includes('2026-09-13'));
  assert.ok(meetingDates.some((date) => date > '2026-09-13'));
});

test('new recruitment positions validate canonical job-opening fields', () => {
  const valid = { title: 'توسعه‌دهنده بک‌اند', department: 'فنی', employmentType: 'full_time' as const, openings: 2, status: 'open' as const, postedAt: '2026-09-13' };
  assert.deepEqual(validateJobOpening(valid), []);
  assert.deepEqual(validateJobOpening({ ...valid, title: '', openings: 0 }), ['عنوان موقعیت', 'ظرفیت معتبر']);
});
