import { database } from '../db/database.js';
import { relationshipIssue, RequestValidationError } from '../middleware/validate.js';
import type { AppRecord, RecordInput } from '../types/entities.js';
import { auditService } from './audit.js';
import { assertAttachableFile } from './fileAccess.js';

function invalid(path: string, message: string): never { throw relationshipIssue(path, message); }
function protectedEvent(): never {
  throw new RequestValidationError([{ location: 'relationship', path: 'params.id', code: 'protected_record', message: 'Automatically generated project events are immutable' }]);
}
function unique(values: unknown): string[] {
  return Array.isArray(values) ? [...new Set(values.map(String).map((value) => value.trim()).filter(Boolean))] : [];
}

async function audit(organizationId: string, actorId: string, action: string, entityType: string, entityId: string, fields: string[], ip?: string, before?: unknown, after?: unknown): Promise<void> {
  await auditService.record({ organizationId, actorId, action, entityType, entityId, before, after, metadata: { requestedFields: fields }, ...(ip ? { ip } : {}) });
}

async function personAliases(organizationId: string, personId: string): Promise<Set<string>> {
  const db = database.forOrganization(organizationId);
  const aliases = new Set([personId]);
  for (const employee of await db.list('Employee')) if (employee.id === personId || employee.userId === personId) {
    aliases.add(employee.id);
    if (typeof employee.userId === 'string') aliases.add(employee.userId);
  }
  return aliases;
}

async function requirePerson(organizationId: string, personId: string, path: string): Promise<void> {
  const db = database.forOrganization(organizationId);
  if (await db.get('User', personId) || await db.get('Employee', personId)) return;
  if ((await db.list('Employee')).some((employee) => employee.userId === personId)) return;
  invalid(path, 'Employee, participant, or organizer does not exist in this organization');
}

async function validateAttachments(organizationId: string, actorId: string, attachmentIds: unknown, path: string, relationship: Parameters<typeof assertAttachableFile>[4]): Promise<string[]> {
  const ids = unique(attachmentIds);
  for (const id of ids) await assertAttachableFile(organizationId, actorId, id, path, relationship);
  return ids;
}

async function validateMeeting(organizationId: string, actorId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const db = database.forOrganization(organizationId);
  await requirePerson(organizationId, String(input.organizerId), 'body.organizerId');
  const participantIds = unique(input.participantIds);
  const employeeIds = unique(input.employeeIds);
  for (const id of participantIds) await requirePerson(organizationId, id, 'body.participantIds');
  for (const id of employeeIds) await requirePerson(organizationId, id, 'body.employeeIds');

  let project: AppRecord | undefined;
  if (input.projectId) {
    project = await db.get('Project', String(input.projectId));
    if (!project) invalid('body.projectId', 'Meeting project does not exist in this organization');
  }
  if (input.customerId) {
    const customer = await db.get('Customer', String(input.customerId));
    if (!customer) invalid('body.customerId', 'Meeting customer does not exist in this organization');
    if (project?.customerId && project.customerId !== input.customerId) invalid('body.customerId', 'Meeting customer does not match the selected project customer');
  }

  const taskIds = unique(input.taskIds);
  let taskProjectId: string | undefined;
  for (const taskId of taskIds) {
    const task = await db.get('Task', taskId);
    if (!task) invalid('body.taskIds', 'Related task does not exist in this organization');
    const relatedProjectId = String(task.projectId);
    if (taskProjectId && taskProjectId !== relatedProjectId) invalid('body.taskIds', 'All related tasks must belong to the same project');
    taskProjectId = relatedProjectId;
    if (project && project.id !== relatedProjectId) invalid('body.taskIds', 'Related task belongs to a different project');
  }
  if (!project && taskProjectId) {
    project = await db.get('Project', taskProjectId);
    input.projectId = taskProjectId;
  }

  const start = Date.parse(String(input.startAt));
  const next = input.nextMeetingAt ? Date.parse(String(input.nextMeetingAt)) : undefined;
  if (next !== undefined && next <= start) {
    throw new RequestValidationError([{ location: 'body', path: 'body.nextMeetingAt', code: 'invalid_date_range', message: 'Next meeting must be after this meeting' }]);
  }
  const customerId = String(input.customerId || project?.customerId || '');
  const relationship = { ...(project ? { projectId: project.id } : {}), ...(customerId ? { customerId } : {}), employeeIds };
  const attachments = await validateAttachments(organizationId, actorId, input.attachments, 'body.attachments', relationship);
  const document = input.meetingDocument as Record<string, unknown> | undefined;
  if (document?.fileId) await assertAttachableFile(organizationId, actorId, String(document.fileId), 'body.meetingDocument.fileId', relationship);
  const departments = unique(input.departments);
  if (!departments.length && typeof input.department === 'string' && input.department.trim()) departments.push(input.department.trim());
  return { ...input, participantIds, employeeIds, taskIds, attachments, departments };
}

async function validateProjectEvent(organizationId: string, actorId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const db = database.forOrganization(organizationId);
  const projectId = String(input.projectId);
  const project = await db.get('Project', projectId);
  if (!project) invalid('body.projectId', 'Project event project does not exist in this organization');
  let member: AppRecord | undefined;
  if (input.projectMemberId) {
    member = await db.get('ProjectMember', String(input.projectMemberId));
    if (!member || member.projectId !== projectId) invalid('body.projectMemberId', 'Related member must belong to the event project');
  }
  if (input.personId) {
    await requirePerson(organizationId, String(input.personId), 'body.personId');
    const aliases = await personAliases(organizationId, String(input.personId));
    const memberships = await db.list('ProjectMember', { projectId });
    const matchingMember = memberships.find((item) => aliases.has(String(item.personId)));
    if (!matchingMember) invalid('body.personId', 'Related employee must be a current or historical project member');
    if (member && member.id !== matchingMember.id) invalid('body.projectMemberId', 'Related member and employee do not match');
    member = matchingMember;
  }
  if (input.phaseId) {
    const phase = await db.get('ProjectPhase', String(input.phaseId));
    if (!phase || phase.projectId !== projectId) invalid('body.phaseId', 'Related phase must belong to the event project');
  }
  if (input.taskId) {
    const task = await db.get('Task', String(input.taskId));
    if (!task || task.projectId !== projectId) invalid('body.taskId', 'Related task must belong to the event project');
    if (input.phaseId && task.phaseId && task.phaseId !== input.phaseId) invalid('body.taskId', 'Related task does not belong to the selected phase');
  }
  return {
    ...input,
    ...(member ? { projectMemberId: member.id, personId: String(member.personId) } : {}),
    attachments: await validateAttachments(organizationId, actorId, input.attachments, 'body.attachments', {
      projectId, ...(typeof project.customerId === 'string' ? { customerId: project.customerId } : {}),
      ...(member ? { employeeId: String(member.personId) } : {}), customerVisible: input.customerVisible === true,
    }),
  };
}

export interface AutomaticProjectEventInput {
  projectId: string;
  eventType: string;
  title: string;
  description: string;
  systemKey: string;
  personId?: string;
  projectMemberId?: string;
  phaseId?: string;
  taskId?: string;
  customerVisible?: boolean;
  priority?: 'عادی' | 'بالا' | 'بسیار بالا';
}

export async function createAutomaticProjectEvent(organizationId: string, actorId: string, input: AutomaticProjectEventInput, ip?: string): Promise<AppRecord> {
  const db = database.forOrganization(organizationId);
  const duplicate = (await db.list('ProjectEvent')).find((event) => event.systemKey === input.systemKey);
  if (duplicate) return duplicate;
  const prepared = await validateProjectEvent(organizationId, actorId, {
    ...input, date: new Date().toISOString(), stage: 'انجام شد', status: 'completed', priority: input.priority ?? 'عادی',
    attachments: [], source: 'system', createdBy: actorId, registeredBy: actorId,
  });
  const event = await db.create('ProjectEvent', prepared);
  await audit(organizationId, actorId, 'project-events.system-created', 'ProjectEvent', event.id, Object.keys(input), ip, undefined, event);
  return event;
}

export class CollaborationDomainService {
  listMeetings(organizationId: string): Promise<AppRecord[]> { return database.forOrganization(organizationId).list('Meeting'); }
  getMeeting(organizationId: string, id: string): Promise<AppRecord | undefined> { return database.forOrganization(organizationId).get('Meeting', id); }
  async createMeeting(organizationId: string, actorId: string, input: RecordInput, ip?: string): Promise<AppRecord> {
    const prepared = await validateMeeting(organizationId, actorId, { status: 'scheduled', ...input, createdBy: actorId });
    const meeting = await database.forOrganization(organizationId).create('Meeting', prepared);
    await audit(organizationId, actorId, 'meetings.created', 'Meeting', meeting.id, Object.keys(input), ip, undefined, meeting); return meeting;
  }
  async updateMeeting(organizationId: string, actorId: string, id: string, patch: Record<string, unknown>, ip?: string): Promise<AppRecord | undefined> {
    const db = database.forOrganization(organizationId); const current = await db.get('Meeting', id); if (!current) return undefined;
    const prepared = await validateMeeting(organizationId, actorId, { ...current, ...patch });
    const { id: _id, organizationId: _organizationId, createdAt: _createdAt, updatedAt: _updatedAt, createdBy: _createdBy, ...mutable } = prepared;
    const meeting = await db.update('Meeting', id, { ...mutable, updatedBy: actorId });
    if (meeting) await audit(organizationId, actorId, 'meetings.updated', 'Meeting', id, Object.keys(patch), ip, current, meeting); return meeting;
  }
  async removeMeeting(organizationId: string, actorId: string, id: string, ip?: string): Promise<boolean> {
    const db = database.forOrganization(organizationId); const current = await db.get('Meeting', id); if (!current) return false;
    const removed = await db.remove('Meeting', id);
    if (removed) await audit(organizationId, actorId, 'meetings.deleted', 'Meeting', id, [], ip, current); return removed;
  }

  listEvents(organizationId: string): Promise<AppRecord[]> { return database.forOrganization(organizationId).list('ProjectEvent'); }
  getEvent(organizationId: string, id: string): Promise<AppRecord | undefined> { return database.forOrganization(organizationId).get('ProjectEvent', id); }
  async createEvent(organizationId: string, actorId: string, input: RecordInput, ip?: string): Promise<AppRecord> {
    const prepared = await validateProjectEvent(organizationId, actorId, { ...input, source: 'manual', createdBy: actorId, registeredBy: actorId });
    const event = await database.forOrganization(organizationId).create('ProjectEvent', prepared);
    await audit(organizationId, actorId, 'project-events.created', 'ProjectEvent', event.id, Object.keys(input), ip, undefined, event); return event;
  }
  async updateEvent(organizationId: string, actorId: string, id: string, patch: Record<string, unknown>, ip?: string): Promise<AppRecord | undefined> {
    const db = database.forOrganization(organizationId); const current = await db.get('ProjectEvent', id); if (!current) return undefined;
    if (current.source === 'system') protectedEvent();
    const prepared = await validateProjectEvent(organizationId, actorId, { ...current, ...patch });
    const { id: _id, organizationId: _organizationId, createdAt: _createdAt, updatedAt: _updatedAt, createdBy: _createdBy, registeredBy: _registeredBy, source: _source, systemKey: _systemKey, ...mutable } = prepared;
    const event = await db.update('ProjectEvent', id, { ...mutable, updatedBy: actorId });
    if (event) await audit(organizationId, actorId, 'project-events.updated', 'ProjectEvent', id, Object.keys(patch), ip, current, event); return event;
  }
  async removeEvent(organizationId: string, actorId: string, id: string, ip?: string): Promise<boolean> {
    const db = database.forOrganization(organizationId); const current = await db.get('ProjectEvent', id); if (!current) return false;
    if (current.source === 'system') protectedEvent();
    const removed = await db.remove('ProjectEvent', id);
    if (removed) await audit(organizationId, actorId, 'project-events.deleted', 'ProjectEvent', id, [], ip, current); return removed;
  }
}
