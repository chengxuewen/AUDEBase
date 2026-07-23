import { mapCollectionToRefine } from '../../mapper/schema-to-refine.js'
import { rolesCollection } from '../../collections/roles.js'

const { List, Create, Edit } = mapCollectionToRefine(rolesCollection)
export { List as RolesList, Create as RolesCreate, Edit as RolesEdit }
