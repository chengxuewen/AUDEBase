import { mapCollectionToRefine } from '../../mapper/schema-to-refine.js'
import { pluginsCollection } from '../../collections/plugins.js'

const { List, Create, Edit } = mapCollectionToRefine(pluginsCollection)
export { List as PluginsList, Create as PluginsCreate, Edit as PluginsEdit }
