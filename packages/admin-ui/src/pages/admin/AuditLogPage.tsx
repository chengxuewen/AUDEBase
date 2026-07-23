import { mapCollectionToRefine } from '../../mapper/schema-to-refine.js'
import { auditLogsCollection } from '../../collections/audit_logs.js'

const { List, Create, Edit } = mapCollectionToRefine(auditLogsCollection)
export { List as AuditLogList, Create as AuditLogCreate, Edit as AuditLogEdit }
