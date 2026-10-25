import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { businessDocuments } from '../src/mock/data.ts';
import type { BusinessDocument, BusinessDocumentType } from '../src/types/index.ts';
import { documentMatchesSection, documentStatusOptions, documentTypeLabels, normalizeBusinessDocument, validateBusinessDocument } from '../src/utils/document.ts';

const requiredTypes: BusinessDocumentType[] = ['proposal', 'project_contract', 'change_request', 'employment_contract', 'acceptance', 'other'];
const asInput = (document: BusinessDocument): Omit<BusinessDocument, 'id' | 'createdAt' | 'updatedAt'> => ({
  documentType: document.documentType, title: document.title, documentNumber: document.documentNumber, summary: document.summary, status: document.status,
  customerId: document.customerId, projectId: document.projectId, employeeId: document.employeeId, requestedById: document.requestedById,
  value: document.value, validityDate: document.validityDate, startDate: document.startDate, endDate: document.endDate, requestDate: document.requestDate,
  requestedDate: document.requestedDate, acceptedDate: document.acceptedDate, impactDescription: document.impactDescription, position: document.position,
  compensation: document.compensation, deliverable: document.deliverable, notes: document.notes, attachments: document.attachments,
  fileRecordIds: document.fileRecordIds, createdBy: document.createdBy, customerVisible: document.customerVisible,
});

test('the canonical document system exposes exactly the six supported types', () => {
  assert.deepEqual(Object.keys(documentTypeLabels).sort(), [...requiredTypes].sort());
  assert.deepEqual([...new Set(businessDocuments.map((document) => document.documentType))].sort(), [...requiredTypes].sort());
});

test('every mock document conforms to its type-specific metadata rules', () => {
  businessDocuments.forEach((document) => {
    assert.deepEqual(validateBusinessDocument(asInput(document)), [], `${document.id} should be valid`);
  });
});

test('proposal documents are customer-level and never carry a project relationship', () => {
  const proposals = businessDocuments.filter((document) => document.documentType === 'proposal');
  assert.ok(proposals.length > 0);
  proposals.forEach((document) => assert.equal(document.projectId, undefined));
});

test('proposal, project contract and employment contract enforce meaningful relationships', () => {
  const common = { title: 'سند آزمایشی', documentNumber: 'TEST-1', summary: '', attachments: ['test.pdf'], createdBy: 'u1', customerVisible: false };
  assert.deepEqual(validateBusinessDocument({ ...common, documentType: 'proposal', status: 'draft' }), ['مشتری', 'ارزش پیشنهاد', 'تاریخ اعتبار']);
  assert.deepEqual(validateBusinessDocument({ ...common, documentType: 'project_contract', status: 'active' }), ['مشتری', 'پروژه', 'ارزش قرارداد', 'تاریخ شروع', 'تاریخ پایان']);
  assert.deepEqual(validateBusinessDocument({ ...common, documentType: 'employment_contract', status: 'active' }), ['کارمند', 'سمت', 'تاریخ شروع', 'مبلغ قرارداد']);
});

test('statuses are constrained by document type', () => {
  assert.equal(documentStatusOptions.proposal.includes('accepted'), false);
  assert.equal(documentStatusOptions.acceptance.includes('accepted'), true);
  const proposal = businessDocuments.find((document) => document.documentType === 'proposal')!;
  assert.deepEqual(validateBusinessDocument({ ...asInput(proposal), status: 'accepted' }), ['وضعیت معتبر']);
});

test('sections derive from real customer, project and employee relationships', () => {
  const projectDocument = businessDocuments.find((document) => document.documentType === 'project_contract')!;
  const employmentDocument = businessDocuments.find((document) => document.documentType === 'employment_contract')!;
  const generalDocument = businessDocuments.find((document) => document.documentType === 'other')!;
  assert.equal(documentMatchesSection(projectDocument, 'projects'), true);
  assert.equal(documentMatchesSection(projectDocument, 'customers'), true);
  assert.equal(documentMatchesSection(projectDocument, 'finance'), true);
  assert.equal(documentMatchesSection(employmentDocument, 'hr'), true);
  assert.equal(documentMatchesSection(generalDocument, 'general'), true);
});

test('accepted sign-off requires the exact acceptance date', () => {
  const acceptance = businessDocuments.find((document) => document.documentType === 'acceptance')!;
  assert.deepEqual(validateBusinessDocument({ ...asInput(acceptance), acceptedDate: undefined }), ['تاریخ پذیرش']);
});

test('legacy persisted documents are normalized before the documents page renders them', () => {
  const normalized = normalizeBusinessDocument({
    id: 'seed-document-employee-handbook',
    title: 'راهنمای داخلی کارکنان',
    type: 'policy',
    section: 'hr',
    status: 'approved',
    ownerId: 'u1',
    fileRecordIds: ['file-1'],
    createdAt: '2026-09-01T00:00:00.000Z',
  });

  assert.equal(normalized.documentType, 'other');
  assert.equal(normalized.status, 'active');
  assert.equal(normalized.createdBy, 'u1');
  assert.equal(normalized.summary, '');
  assert.match(normalized.documentNumber, /^LEGACY-/);
  assert.deepEqual(normalized.attachments, []);
  assert.deepEqual(normalized.fileRecordIds, ['file-1']);
  assert.doesNotThrow(() => normalized.attachments.length);
});
