import { mapCollectionToRefine } from '../../mapper/schema-to-refine.js'
import { modelLibraryCollection } from '../../collections/model_library.js'

const { List, Create, Edit } = mapCollectionToRefine(modelLibraryCollection)
export { List as ModelLibraryList, Create as ModelLibraryCreate, Edit as ModelLibraryEdit }
