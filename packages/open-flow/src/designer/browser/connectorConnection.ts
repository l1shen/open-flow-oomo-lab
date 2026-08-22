import type { ConnectorConnection } from '../../connector/common/model.ts'

import { useEffect, useMemo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useDesignerStore } from './graph/DesignerStoreContext.tsx'

export function useConnectorConnections(action: string): readonly ConnectorConnection[] | null | undefined {
  return useConnectorServiceConnections(action.split('.', 1)[0]!)
}

export function useConnectorServiceConnections(service: string): readonly ConnectorConnection[] | null | undefined {
  const store = useDesignerStore().connectorConnections
  const connections$ = useMemo(() => store?.connections(service), [service, store])
  const connections = useVal(connections$)

  useEffect(() => {
    if (store != null) void store.load(service)
  }, [service, store])

  return connections
}
