import type { WorkbenchLocation } from '@oomol-lab/open-flow/workbench'

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value)
  } catch {
    return
  }
}

export function parseRoute(pathname: string): WorkbenchLocation {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] != 'projects' || parts[1] == null) return { view: 'design' }

  const projectId = decode(parts[1])
  if (projectId == null) return { view: 'design' }
  if (parts.length == 2) return { projectId, view: 'design' }
  if (parts.length != 5 || parts[2] != 'flows' || parts[3] == null) return { view: 'design' }

  const flowId = decode(parts[3])
  if (flowId == null) return { view: 'design' }
  switch (parts[4]) {
    case 'design':
    case 'publications':
    case 'runs':
      return { flowId, projectId, view: parts[4] }
    default:
      return { view: 'design' }
  }
}

export function routePath(route: WorkbenchLocation): string {
  if (route.projectId == null) return '/'
  const project = `/projects/${encodeURIComponent(route.projectId)}`
  if (route.flowId != null) return `${project}/flows/${encodeURIComponent(route.flowId)}/${route.view}`
  return project
}
