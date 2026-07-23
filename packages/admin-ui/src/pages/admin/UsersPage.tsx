import { mapCollectionToRefine } from '../../mapper/schema-to-refine.js'
import { usersCollection } from '../../collections/users.js'

const { List, Create, Edit } = mapCollectionToRefine(usersCollection)
export { List as UsersList, Create as UsersCreate, Edit as UsersEdit }
