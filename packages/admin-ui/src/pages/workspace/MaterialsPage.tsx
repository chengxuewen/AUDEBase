import { mapCollectionToRefine } from '../../mapper/schema-to-refine.js'
import { materialsCollection } from '../../collections/materials.js'

const { List, Create, Edit } = mapCollectionToRefine(materialsCollection)
export { List as MaterialsList, Create as MaterialsCreate, Edit as MaterialsEdit }
