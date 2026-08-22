export type ResourceUri = string

export interface ResourceUriResolver {
  (resourcePathOrUri: string | undefined, manifestPath: string, searchPath: string): ResourceUri | undefined
}

export interface StaticResourceUriResolver {
  (resourcePath: string): ResourceUri | undefined
}
