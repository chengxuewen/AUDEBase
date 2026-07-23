import type { ReactNode } from 'react'
import { Refine } from '@refinedev/core'
import { dataProvider } from './dataProvider.js'
import { authProvider } from './authProvider.js'

interface RefineProviderProps {
  children: ReactNode
}

export function RefineProvider({ children }: RefineProviderProps): ReactNode {
  return (
    <Refine dataProvider={dataProvider} authProvider={authProvider}>
      {children}
    </Refine>
  )
}
