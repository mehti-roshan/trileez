import { Router } from 'express';
import { requireAuth, requireResourceAccess } from '../middleware/auth.js';
import { database } from '../db/database.js';

const router = Router();
router.get('/summary', requireAuth, requireResourceAccess('dashboard', 'read'), async (req, res, next) => {
  try {
    const db = database.forOrganization(req.user!.organizationId);
    const [employees, projects, tasks, meetings] = await Promise.all([db.count('Employee'), db.count('Project'), db.count('Task'), db.count('Meeting')]);
    res.json({ data: { employees, projects, tasks, meetings, database: database.mode() } });
  } catch (error) { next(error); }
});
export default router;
