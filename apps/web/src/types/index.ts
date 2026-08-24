export type UserRole = 'admin' | 'manager' | 'member';
export type UserStatus = 'online' | 'away' | 'offline';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type CustomerStatus = 'active' | 'inactive' | 'lead';
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'closed';
export type DeviceStatus = 'online' | 'offline' | 'busy';
export type SessionStatus = 'pending' | 'active' | 'ended' | 'rejected';
export type TicketCategory = 'bug' | 'feature' | 'support' | 'other';

export interface User { id: string; name: string; email: string; role: UserRole; status: UserStatus; title: string; avatar?: string }
export interface Organization { id: string; name: string; slug: string }
export interface Project { id: string; name: string; description: string; status: ProjectStatus; progress: number; startDate: string; endDate: string; members: string[]; tasksCount: number; completedTasksCount: number; color: string }
export interface Task { id: string; title: string; description?: string; status: TaskStatus; priority: Priority; assigneeId: string; projectId: string; dueDate: string; createdAt: string; updatedAt: string; tags: string[] }
export interface Customer { id: string; name: string; company: string; email: string; phone: string; status: CustomerStatus; value: number; lastContact: string; assignedTo: string }
export interface Ticket { id: string; title: string; description: string; status: TicketStatus; priority: Priority; category: TicketCategory; assigneeId: string; reporterId: string; createdAt: string; updatedAt: string; tags: string[] }
export interface Device { id: string; name: string; userId: string; userName: string; os: string; osVersion: string; agentVersion: string; status: DeviceStatus; lastSeen: string; ipAddress: string; location: string; health: number }
export interface MonitoringSession { id: string; deviceId: string; operatorId: string; operatorName: string; status: SessionStatus; capabilities: string[]; consentMode: 'attended' | 'unattended'; startedAt?: string; endedAt?: string; duration?: number }
export interface ScreenshotPreview { id: string; deviceId: string; deviceName: string; capturedAt: string; label: string; tone: string }
export interface Activity { id: string; type: string; userId: string; userName: string; entityType: string; entityId: string; entityName: string; description: string; createdAt: string }
export interface NotificationItem { id: string; title: string; body: string; createdAt: string; read: boolean }
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'lost' | 'converted';
export type DocumentStatus = 'draft' | 'sent' | 'approved' | 'paid' | 'overdue' | 'cancelled';
export interface Lead { id: string; name: string; company: string; email: string; phone: string; estimatedValue: number; tags: string[]; assignedTo: string; status: LeadStatus; source: string; lastContactAt: string; nextFollowUpAt: string; notes: string; createdAt: string }
export interface Product { id: string; name: string; sku: string; category: string; unit: string; price: number; stock: number; active: boolean }
export interface Proposal { id: string; number: string; customerId: string; title: string; amount: number; status: DocumentStatus; issuedAt: string; validUntil: string; ownerId: string }
export interface Invoice { id: string; number: string; customerId: string; contractId?: string; amount: number; paidAmount: number; status: DocumentStatus; issuedAt: string; dueDate: string }
export interface Payment { id: string; receiptNumber: string; customerId: string; invoiceId: string; amount: number; method: string; paidAt: string; reference: string }
export interface Contract { id: string; number: string; customerId: string; title: string; amount: number; startDate: string; endDate: string; status: 'active' | 'expired' | 'pending'; renewal: boolean }
export interface Installment { id: string; contractId: string; number: number; dueDate: string; amount: number; paidAmount: number; status: 'paid' | 'due' | 'overdue' }
