import type { StaticResourceUriResolver } from '../../base/common/resource.ts'

import { identity } from 'value-enhancer'

export interface DesignerResourceService {
  readonly resolveStaticResourceUri: StaticResourceUriResolver
}

export class BrowserResourceService implements DesignerResourceService {
  public readonly resolveStaticResourceUri: StaticResourceUriResolver = identity
}
